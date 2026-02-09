// Player Placement (from player_placements table)
export interface PlayerPlacement {
  id: string;
  team_assignment_id: string;
  source_registration_id: string;
  player_id: string;
  assigned_team_id: string | null;
  status:
    | 'unassigned'
    | 'assigned'
    | 'invited'
    | 'accepted'
    | 'declined'
    | 'waitlisted'
    | 'rostered';
  invitation_token: string | null;
  invited_at: string | null;
  invitation_expires_at: string | null;
  invitation_email_sent: boolean;
  responded_at: string | null;
  decline_reason: string | null;
  destination_registration_id: string | null;
  rostered_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  assigned_by: string | null;
}

// Payment Plan Option (from payment_plan_options table)
export interface PaymentPlanOption {
  id: string;
  package_id: string;
  name: string;
  total_amount: number;
  num_installments: number;
  initial_payment_amount: number | null;
  initial_payment_type: 'fixed' | 'percentage' | null;
  initial_payment_percentage: number | null;
  initial_payment_label: string | null;
  is_active: boolean;
  is_default: boolean;
  sort_order: number;
}

// Payment Plan Installment (from payment_plan_installments table)
export interface PaymentPlanInstallment {
  id: string;
  plan_option_id: string;
  installment_number: number;
  description: string | null;
  amount: number;
  due_date: string;
  overdue_date: string | null;
  late_fee: number | null;
}

// Package with team assignment
export interface InvitationPackage {
  id: string;
  program_id: string;
  name: string;
  description: string | null;
  price: number;
  is_active: boolean;
  sort_order: number;
  payment_plans: PaymentPlanOption[];
}

// Program Question (from program_questions table)
export interface ProgramQuestion {
  id: string;
  program_id: string;
  question_text: string;
  question_type: 'text' | 'select' | 'checkbox' | 'radio' | 'textarea';
  label?: string;
  field_type?: string;
  placeholder?: string;
  description?: string;
  options: string[] | null;
  is_required: boolean;
  sort_order: number;
  applies_to_teams: string[] | null;
  question_scope?: 'per_family' | 'per_player' | 'program' | 'family' | 'player';
}

// Volunteer Position (from volunteer_positions table)
export interface VolunteerPosition {
  id: string;
  program_id: string;
  name: string;
  description: string | null;
  max_volunteers: number | null;
  discount_amount: number | null;
  discount_percentage: number | null;
  assigned_team_ids: string[] | null;
}

// Full invitation data (joined from multiple tables)
export interface InvitationData {
  placement: PlayerPlacement;
  player: {
    id: string;
    first_name: string;
    last_name: string;
    date_of_birth: string | null;
    photo_url: string | null;
    parent_email: string;
  };
  team: {
    id: string;
    name: string;
    age_group: string | null;
    gender: string | null;
  };
  club: {
    id: string;
    name: string;
    logo_url: string | null;
  };
  assignment: {
    id: string;
    name: string;
    destination_program_id: string;
    invitation_deadline: string | null;
  };
  program: {
    id: string;
    name: string;
    description: string | null;
  };
  packages: InvitationPackage[];
  questions: ProgramQuestion[];
  volunteer_positions: VolunteerPosition[];
  program_settings: {
    donations_enabled: boolean;
    financial_aid_enabled: boolean;
    min_donation_amount: number | null;
    donation_presets: number[] | null;
  };
}

// Family invitation state (for multi-child checkout)
export interface FamilyInvitationState {
  invitations: InvitationData[];
  selections: {
    [placementId: string]: {
      selected: boolean;
      packageId: string | null;
      paymentPlanId: string | null;
      questionAnswers: Record<string, unknown>;
      volunteerPositionIds: string[];
    };
  };
  familyQuestionAnswers: Record<string, unknown>;
  donationAmount: number | null;
  financialAidRequested: boolean;
}
