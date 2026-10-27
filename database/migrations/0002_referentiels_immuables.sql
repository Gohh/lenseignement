-- Une version de programme publiée est figée (cahier §2.4 et §6.1, ADR-004).
-- Ces règles sont dans la base pour s'appliquer quel que soit le chemin d'écriture.

CREATE FUNCTION curriculum_content_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_version uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.version_id ELSE NEW.version_id END;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.version_id <> OLD.version_id THEN
    RAISE EXCEPTION 'curriculum_version_immutable: changement de version interdit'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM curriculum_versions v WHERE v.id = target_version AND v.status <> 'draft') THEN
    RAISE EXCEPTION 'curriculum_version_immutable: la version % est publiée', target_version
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER levels_immutable BEFORE INSERT OR UPDATE OR DELETE ON levels
  FOR EACH ROW EXECUTE FUNCTION curriculum_content_guard();
--> statement-breakpoint
CREATE TRIGGER subjects_immutable BEFORE INSERT OR UPDATE OR DELETE ON subjects
  FOR EACH ROW EXECUTE FUNCTION curriculum_content_guard();
--> statement-breakpoint
CREATE TRIGGER competencies_immutable BEFORE INSERT OR UPDATE OR DELETE ON competencies
  FOR EACH ROW EXECUTE FUNCTION curriculum_content_guard();
--> statement-breakpoint
CREATE TRIGGER competency_edges_immutable BEFORE INSERT OR UPDATE OR DELETE ON competency_edges
  FOR EACH ROW EXECUTE FUNCTION curriculum_content_guard();
--> statement-breakpoint
-- Version publiée : seule la date de fin peut être posée, une fois. Pas de suppression.
CREATE FUNCTION curriculum_version_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'curriculum_version_immutable: suppression d''une version publiée interdite'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'draft' AND (
       NEW.status IS DISTINCT FROM OLD.status
    OR NEW.curriculum_id IS DISTINCT FROM OLD.curriculum_id
    OR NEW.label IS DISTINCT FROM OLD.label
    OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
    OR NEW.policy_source_id IS DISTINCT FROM OLD.policy_source_id
    OR NEW.notes IS DISTINCT FROM OLD.notes
    OR NEW.published_at IS DISTINCT FROM OLD.published_at
    OR (OLD.effective_to IS NOT NULL AND NEW.effective_to IS DISTINCT FROM OLD.effective_to)
  ) THEN
    RAISE EXCEPTION 'curriculum_version_immutable: la version % est publiée', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER curriculum_versions_immutable BEFORE UPDATE OR DELETE ON curriculum_versions
  FOR EACH ROW EXECUTE FUNCTION curriculum_version_guard();
