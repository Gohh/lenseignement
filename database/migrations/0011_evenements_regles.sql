-- Journal des actions des apprenants (ADR-011) : ajout seulement, comme les tentatives de quiz.
CREATE FUNCTION append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '%: historique en ajout seulement', TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER learning_events_immutable BEFORE UPDATE OR DELETE ON learning_events
  FOR EACH ROW EXECUTE FUNCTION append_only();
