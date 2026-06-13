-- Migration: fix apply_discount_to_remaining to preserve total_amount
-- Bug: original line computed v_new_total := v_registration.amount_paid + v_target_remaining,
-- which silently dropped any portion of total_amount that wasn't in pending installments.
-- Fix: compute v_new_total as current total minus the discount delta. This matches the
-- pattern already used correctly in adjust_future_payment_amount and cancel_all_future_payments.
-- No data migration; existing broken row (1 row, Lucas Sanchez test) remediated via UI reversal.

CREATE OR REPLACE FUNCTION public.apply_discount_to_remaining(p_registration_id uuid, p_mode text, p_value numeric DEFAULT NULL::numeric, p_custom_amounts jsonb DEFAULT NULL::jsonb, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_registration program_registrations%ROWTYPE;
  v_pending_count int;
  v_pending_total numeric(10,2);
  v_target_remaining numeric(10,2);
  v_new_total numeric(10,2);
  v_new_payment_status text;
  v_affected_ids uuid[];
  v_before_payments jsonb;
  v_after_payments jsonb;
  v_before_snapshot jsonb;
  v_after_snapshot jsonb;
  v_adjustment_id uuid;
  v_processing_count int;
  v_action_type text;
  v_custom_count int;
  v_payment RECORD;
  v_running_sum numeric(10,2) := 0;
  v_per_row numeric(10,2);
  v_new_amount numeric(10,2);
  v_row_index int := 0;
  v_custom_amount numeric(10,2);
  v_custom_key text;
  v_custom_payment registration_payments%ROWTYPE;
BEGIN
  IF p_registration_id IS NULL THEN
    RAISE EXCEPTION 'registration_id is required';
  END IF;
  IF p_mode NOT IN ('pct', 'flat', 'custom') THEN
    RAISE EXCEPTION 'mode must be pct, flat, or custom';
  END IF;
  IF char_length(coalesce(p_reason, '')) < 3 THEN
    RAISE EXCEPTION 'reason must be at least 3 characters';
  END IF;
  IF p_mode = 'pct' THEN
    IF p_value IS NULL OR p_value < 0 OR p_value > 100 THEN
      RAISE EXCEPTION 'pct value must be between 0 and 100';
    END IF;
    v_action_type := 'discount_pct_remaining';
  ELSIF p_mode = 'flat' THEN
    IF p_value IS NULL OR p_value < 0 THEN
      RAISE EXCEPTION 'flat value must be non-negative';
    END IF;
    v_action_type := 'discount_flat_remaining';
  ELSE
    IF p_custom_amounts IS NULL OR jsonb_typeof(p_custom_amounts) <> 'object' THEN
      RAISE EXCEPTION 'custom mode requires p_custom_amounts jsonb object';
    END IF;
    v_action_type := 'custom_per_row';
  END IF;

  SELECT * INTO v_registration FROM program_registrations WHERE id = p_registration_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'registration not found: %', p_registration_id;
  END IF;

  IF NOT is_club_admin(auth.uid(), v_registration.club_id)
     AND NOT has_role(auth.uid(), 'platform_admin') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT count(*) INTO v_processing_count
  FROM registration_payments
  WHERE registration_id = p_registration_id
    AND status = 'pending'
    AND auto_charge_status = 'processing';
  IF v_processing_count > 0 THEN
    RAISE EXCEPTION '% payment(s) are currently being charged; try again in a moment', v_processing_count;
  END IF;

  PERFORM 1 FROM registration_payments
  WHERE registration_id = p_registration_id AND status = 'pending'
  FOR UPDATE;

  SELECT
    array_agg(rp.id ORDER BY rp.due_date NULLS LAST, rp.id),
    count(*),
    coalesce(sum(rp.amount), 0),
    jsonb_agg(jsonb_build_object(
      'id', rp.id, 'amount', rp.amount, 'status', rp.status,
      'auto_charge_status', rp.auto_charge_status,
      'adjusted_at', rp.adjusted_at, 'adjusted_by', rp.adjusted_by,
      'adjustment_reason', rp.adjustment_reason,
      'pre_adjustment_amount', rp.pre_adjustment_amount,
      'due_date', rp.due_date
    ) ORDER BY rp.due_date NULLS LAST, rp.id)
  INTO v_affected_ids, v_pending_count, v_pending_total, v_before_payments
  FROM registration_payments rp
  WHERE rp.registration_id = p_registration_id AND rp.status = 'pending';

  IF v_pending_count IS NULL OR v_pending_count = 0 THEN
    RETURN jsonb_build_object(
      'success', true, 'no_op', true,
      'message', 'No pending payments to adjust',
      'new_total_amount', v_registration.total_amount,
      'new_payment_status', v_registration.payment_status
    );
  END IF;

  IF p_mode = 'pct' THEN
    v_target_remaining := round(v_pending_total * (1 - p_value / 100.0), 2);
  ELSIF p_mode = 'flat' THEN
    v_target_remaining := round(greatest(0, v_pending_total - p_value), 2);
  ELSE
    SELECT count(*) INTO v_custom_count FROM jsonb_object_keys(p_custom_amounts);
    IF v_custom_count <> v_pending_count THEN
      RAISE EXCEPTION 'custom mode requires amounts for all % pending rows, received %', v_pending_count, v_custom_count;
    END IF;
    v_target_remaining := 0;
    FOR v_custom_key IN SELECT jsonb_object_keys(p_custom_amounts) LOOP
      SELECT * INTO v_custom_payment
      FROM registration_payments
      WHERE id = v_custom_key::uuid AND registration_id = p_registration_id AND status = 'pending';
      IF NOT FOUND THEN
        RAISE EXCEPTION 'payment % not found as pending in this registration', v_custom_key;
      END IF;
      v_custom_amount := round((p_custom_amounts ->> v_custom_key)::numeric, 2);
      IF v_custom_amount < 0 THEN
        RAISE EXCEPTION 'custom amount for % must be non-negative', v_custom_key;
      END IF;
      IF v_custom_amount > v_custom_payment.amount THEN
        RAISE EXCEPTION 'custom amount % exceeds existing % for payment %; use adjust_future_payment_amount for increases',
          v_custom_amount, v_custom_payment.amount, v_custom_key;
      END IF;
      v_target_remaining := v_target_remaining + v_custom_amount;
    END LOOP;
  END IF;

  IF v_target_remaining = v_pending_total THEN
    RETURN jsonb_build_object(
      'success', true, 'no_op', true, 'message', 'discount produced no change',
      'new_total_amount', v_registration.total_amount,
      'new_payment_status', v_registration.payment_status
    );
  END IF;

  v_new_total := v_registration.total_amount - (v_pending_total - v_target_remaining);

  IF v_new_total < v_registration.amount_paid THEN
    RAISE EXCEPTION 'adjusted total (%) would be less than amount_paid (%)',
      v_new_total, v_registration.amount_paid;
  END IF;

  v_new_payment_status := CASE
    WHEN v_registration.payment_status = 'refunded' THEN 'refunded'
    WHEN v_new_total = 0 THEN 'unpaid'
    WHEN v_registration.amount_paid >= v_new_total THEN 'paid'
    WHEN v_registration.amount_paid > 0 THEN 'partial'
    ELSE 'unpaid'
  END;

  IF p_mode IN ('pct', 'flat') THEN
    v_per_row := round(v_target_remaining / v_pending_count, 2);
    v_running_sum := 0;
    v_row_index := 0;
    FOR v_payment IN
      SELECT id, amount FROM registration_payments
      WHERE registration_id = p_registration_id AND status = 'pending'
      ORDER BY due_date NULLS LAST, id
    LOOP
      v_row_index := v_row_index + 1;
      IF v_row_index = v_pending_count THEN
        v_new_amount := round(v_target_remaining - v_running_sum, 2);
      ELSE
        v_new_amount := v_per_row;
        v_running_sum := v_running_sum + v_per_row;
      END IF;
      UPDATE registration_payments
      SET amount = v_new_amount,
          pre_adjustment_amount = coalesce(pre_adjustment_amount, v_payment.amount),
          adjusted_at = now(), adjusted_by = auth.uid(), adjustment_reason = p_reason
      WHERE id = v_payment.id;
    END LOOP;
  ELSE
    FOR v_custom_key IN SELECT jsonb_object_keys(p_custom_amounts) LOOP
      v_custom_amount := round((p_custom_amounts ->> v_custom_key)::numeric, 2);
      UPDATE registration_payments
      SET amount = v_custom_amount,
          pre_adjustment_amount = coalesce(pre_adjustment_amount, amount),
          adjusted_at = now(), adjusted_by = auth.uid(), adjustment_reason = p_reason
      WHERE id = v_custom_key::uuid;
    END LOOP;
  END IF;

  UPDATE program_registrations
  SET total_amount = v_new_total, payment_status = v_new_payment_status, updated_at = now()
  WHERE id = p_registration_id;

  SELECT jsonb_agg(jsonb_build_object(
    'id', rp.id, 'amount', rp.amount, 'status', rp.status,
    'pre_adjustment_amount', rp.pre_adjustment_amount
  ) ORDER BY rp.due_date NULLS LAST, rp.id)
  INTO v_after_payments
  FROM registration_payments rp WHERE rp.id = ANY(v_affected_ids);

  v_before_snapshot := jsonb_build_object(
    'payments', v_before_payments,
    'registration', jsonb_build_object(
      'total_amount', v_registration.total_amount,
      'payment_status', v_registration.payment_status
    )
  );

  v_after_snapshot := jsonb_build_object(
    'payments', v_after_payments,
    'registration', jsonb_build_object(
      'total_amount', v_new_total, 'payment_status', v_new_payment_status
    )
  );

  INSERT INTO payment_adjustments (
    registration_id, action_type, discount_pct, discount_flat, reason, admin_id,
    affected_payment_ids, before_snapshot, after_snapshot
  ) VALUES (
    p_registration_id, v_action_type,
    CASE WHEN p_mode = 'pct' THEN p_value ELSE NULL END,
    CASE WHEN p_mode = 'flat' THEN p_value ELSE NULL END,
    p_reason, auth.uid(),
    v_affected_ids, v_before_snapshot, v_after_snapshot
  ) RETURNING id INTO v_adjustment_id;

  RETURN jsonb_build_object(
    'success', true, 'adjustment_id', v_adjustment_id, 'action_type', v_action_type,
    'mode', p_mode, 'original_remaining', v_pending_total,
    'new_remaining', v_target_remaining,
    'discount_amount', v_pending_total - v_target_remaining,
    'new_total_amount', v_new_total, 'new_payment_status', v_new_payment_status
  );
END;
$function$;
