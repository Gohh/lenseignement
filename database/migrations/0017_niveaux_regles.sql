-- Niveaux et classes : le niveau fait partie du contenu d'une version, figé comme le reste dès
-- qu'elle n'est plus un brouillon.

-- Cours FICTIFS de démonstration déjà en base : on leur donne leur niveau avant de figer la colonne.
UPDATE course_versions SET level = 'cp1' WHERE id IN (
  '60000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000002',
  '60000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000004',
  '60000000-0000-4000-8000-000000000005');
--> statement-breakpoint
UPDATE course_versions SET level = 'cp2' WHERE id = '60000000-0000-4000-8000-000000000006';
--> statement-breakpoint
UPDATE course_versions SET level = 'alpha-1' WHERE id = '60000000-0000-4000-8000-000000000007';
--> statement-breakpoint
CREATE OR REPLACE FUNCTION course_version_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  content_changed boolean;
  workflow_changed boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'course_version_immutable: suppression d''une version non brouillon interdite'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  content_changed :=
       NEW.course_id IS DISTINCT FROM OLD.course_id
    OR NEW.number IS DISTINCT FROM OLD.number
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.summary IS DISTINCT FROM OLD.summary
    OR NEW.audience IS DISTINCT FROM OLD.audience
    OR NEW.language IS DISTINCT FROM OLD.language
    OR NEW.licence IS DISTINCT FROM OLD.licence
    OR NEW.estimated_minutes IS DISTINCT FROM OLD.estimated_minutes
    OR NEW.curriculum_version_id IS DISTINCT FROM OLD.curriculum_version_id
    OR NEW.level IS DISTINCT FROM OLD.level
    OR NEW.revision IS DISTINCT FROM OLD.revision
    OR NEW.created_by IS DISTINCT FROM OLD.created_by;
  workflow_changed :=
       NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
    OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
    OR NEW.published_by IS DISTINCT FROM OLD.published_by
    OR NEW.published_at IS DISTINCT FROM OLD.published_at;

  IF NEW.status = OLD.status THEN
    IF workflow_changed THEN
      RAISE EXCEPTION 'course_workflow: le circuit de validation ne change qu''avec le statut'
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.status <> 'draft' AND content_changed THEN
      RAISE EXCEPTION 'course_version_immutable: la version % n''est plus un brouillon', OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF content_changed THEN
    RAISE EXCEPTION 'course_version_immutable: le contenu ne change pas avec le statut'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.status = 'draft' AND NEW.status = 'in_review' THEN
    IF NEW.submitted_by IS NULL OR NEW.approved_by IS NOT NULL
       OR NEW.published_by IS NOT NULL OR NEW.published_at IS NOT NULL THEN
      RAISE EXCEPTION 'course_workflow: soumission invalide' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF OLD.status IN ('in_review', 'approved') AND NEW.status = 'draft' THEN
    IF NEW.submitted_by IS NOT NULL OR NEW.approved_by IS NOT NULL
       OR NEW.published_by IS NOT NULL OR NEW.published_at IS NOT NULL THEN
      RAISE EXCEPTION 'course_workflow: retour en brouillon invalide' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF OLD.status = 'in_review' AND NEW.status = 'approved' THEN
    IF NEW.submitted_by IS DISTINCT FROM OLD.submitted_by OR NEW.approved_by IS NULL
       OR NEW.approved_by IN (NEW.created_by, NEW.submitted_by)
       OR NEW.published_by IS NOT NULL OR NEW.published_at IS NOT NULL THEN
      RAISE EXCEPTION 'course_workflow: l''approbation exige une personne autre que l''auteur'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF OLD.status = 'approved' AND NEW.status = 'published' THEN
    IF NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.published_by IS NULL OR NEW.published_at IS NULL
       OR NEW.published_by IN (NEW.created_by, NEW.submitted_by, NEW.approved_by) THEN
      RAISE EXCEPTION 'course_workflow: la publication exige une deuxième validation indépendante'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF OLD.status = 'published' AND NEW.status = 'archived' THEN
    IF workflow_changed THEN
      RAISE EXCEPTION 'course_workflow: archivage invalide' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    RAISE EXCEPTION 'course_workflow: passage de % à % interdit', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
