-- Bilan et rattrapage (ADR-013). Questions, bilans, réponses et résultats : ajout seulement.
CREATE TRIGGER diagnostics_immutable BEFORE UPDATE OR DELETE ON diagnostics
  FOR EACH ROW EXECUTE FUNCTION append_only();
--> statement-breakpoint
CREATE TRIGGER diagnostic_items_immutable BEFORE UPDATE OR DELETE ON diagnostic_items
  FOR EACH ROW EXECUTE FUNCTION append_only();
--> statement-breakpoint
CREATE TRIGGER diagnostic_sessions_immutable BEFORE UPDATE OR DELETE ON diagnostic_sessions
  FOR EACH ROW EXECUTE FUNCTION append_only();
--> statement-breakpoint
CREATE TRIGGER diagnostic_responses_immutable BEFORE UPDATE OR DELETE ON diagnostic_responses
  FOR EACH ROW EXECUTE FUNCTION append_only();
--> statement-breakpoint
CREATE TRIGGER skill_results_immutable BEFORE UPDATE OR DELETE ON skill_results
  FOR EACH ROW EXECUTE FUNCTION append_only();
--> statement-breakpoint
-- Un plan ne se supprime pas ; seul un plan en cours se clôt (terminé ou remplacé), une fois,
-- sans rien changer d'autre : la proposition et son explication restent telles qu'affichées.
CREATE FUNCTION remediation_plans_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'remediation_plans: suppression interdite' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status <> 'active' OR NEW.status = 'active' OR NEW.closed_at IS NULL
     OR (to_jsonb(NEW) - 'status' - 'closed_at') <> (to_jsonb(OLD) - 'status' - 'closed_at') THEN
    RAISE EXCEPTION 'remediation_plans: seule la clôture d''un plan en cours est permise'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER remediation_plans_guard BEFORE UPDATE OR DELETE ON remediation_plans
  FOR EACH ROW EXECUTE FUNCTION remediation_plans_guard();
