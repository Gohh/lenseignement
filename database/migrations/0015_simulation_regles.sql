-- Simulation de sécurité (ADR-014). Simulations, essais et demandes : ajout seulement.
CREATE TRIGGER safety_simulations_immutable BEFORE UPDATE OR DELETE ON safety_simulations
  FOR EACH ROW EXECUTE FUNCTION append_only();
--> statement-breakpoint
CREATE TRIGGER simulation_attempts_immutable BEFORE UPDATE OR DELETE ON simulation_attempts
  FOR EACH ROW EXECUTE FUNCTION append_only();
--> statement-breakpoint
CREATE TRIGGER practice_requests_immutable BEFORE UPDATE OR DELETE ON practice_requests
  FOR EACH ROW EXECUTE FUNCTION append_only();
--> statement-breakpoint
-- E2E-05 : pas de séance pratique sans simulation réussie. L'essai cité doit être celui de
-- l'apprenant, pour cette simulation, réussi, et son dernier essai.
CREATE FUNCTION practice_requests_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  latest simulation_attempts%ROWTYPE;
BEGIN
  SELECT * INTO latest FROM simulation_attempts
   WHERE user_id = NEW.user_id AND simulation_id = NEW.simulation_id
   ORDER BY submitted_at DESC, id DESC LIMIT 1;
  IF latest.id IS NULL OR latest.id <> NEW.attempt_id OR NOT latest.passed THEN
    RAISE EXCEPTION 'practice_requests: simulation de sécurité non réussie'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER practice_requests_guard BEFORE INSERT ON practice_requests
  FOR EACH ROW EXECUTE FUNCTION practice_requests_guard();
