-- Seul le brouillon d'un cours est modifiable (ADR-005). Une version envoyée en relecture,
-- approuvée ou publiée est figée : pour la changer, on crée une nouvelle version.

CREATE FUNCTION course_content_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_version uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.course_version_id ELSE NEW.course_version_id END;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.course_version_id <> OLD.course_version_id THEN
    RAISE EXCEPTION 'course_version_immutable: changement de version interdit'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM course_versions v WHERE v.id = target_version AND v.status <> 'draft') THEN
    RAISE EXCEPTION 'course_version_immutable: la version % n''est plus un brouillon', target_version
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER course_modules_immutable BEFORE INSERT OR UPDATE OR DELETE ON course_modules
  FOR EACH ROW EXECUTE FUNCTION course_content_guard();
--> statement-breakpoint
CREATE TRIGGER lessons_immutable BEFORE INSERT OR UPDATE OR DELETE ON lessons
  FOR EACH ROW EXECUTE FUNCTION course_content_guard();
--> statement-breakpoint
-- Une leçon et son module appartiennent toujours à la même version.
CREATE FUNCTION lesson_module_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM course_modules m WHERE m.id = NEW.module_id AND m.course_version_id = NEW.course_version_id
  ) THEN
    RAISE EXCEPTION 'course_version_immutable: la leçon et son module doivent appartenir à la même version'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER lessons_same_version BEFORE INSERT OR UPDATE ON lessons
  FOR EACH ROW EXECUTE FUNCTION lesson_module_guard();
--> statement-breakpoint
CREATE TRIGGER course_version_competencies_immutable BEFORE INSERT OR UPDATE OR DELETE ON course_version_competencies
  FOR EACH ROW EXECUTE FUNCTION course_content_guard();
--> statement-breakpoint
-- Hors brouillon, seul le statut peut évoluer (circuit de validation, ticket 9). Pas de suppression.
CREATE FUNCTION course_version_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'course_version_immutable: suppression d''une version non brouillon interdite'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'draft' AND (
       NEW.course_id IS DISTINCT FROM OLD.course_id
    OR NEW.number IS DISTINCT FROM OLD.number
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.summary IS DISTINCT FROM OLD.summary
    OR NEW.audience IS DISTINCT FROM OLD.audience
    OR NEW.language IS DISTINCT FROM OLD.language
    OR NEW.licence IS DISTINCT FROM OLD.licence
    OR NEW.estimated_minutes IS DISTINCT FROM OLD.estimated_minutes
    OR NEW.curriculum_version_id IS DISTINCT FROM OLD.curriculum_version_id
    OR NEW.revision IS DISTINCT FROM OLD.revision
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
  ) THEN
    RAISE EXCEPTION 'course_version_immutable: la version % n''est plus un brouillon', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER course_versions_immutable BEFORE UPDATE OR DELETE ON course_versions
  FOR EACH ROW EXECUTE FUNCTION course_version_guard();
