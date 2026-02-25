/**
 * Returns true if the event has already ended (event end is in the past).
 * Uses end_time on the event date when present, otherwise end of event_date day.
 */
export function isEventPast(event: {
  event_date: string;
  end_time?: string | null;
}): boolean {
  const endTimeStr = event.end_time?.trim();
  const eventEnd =
    endTimeStr && /^\d{1,2}:\d{2}/.test(endTimeStr)
      ? new Date(event.event_date + 'T' + endTimeStr)
      : new Date(event.event_date + 'T23:59:59');
  return eventEnd < new Date();
}
