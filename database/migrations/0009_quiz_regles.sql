-- Quiz formatifs (ADR-010). Les questions sont figées avec leur version de cours, comme les
-- leçons ; les tentatives et réponses sont en ajout seulement.

CREATE TRIGGER quiz_questions_immutable BEFORE INSERT OR UPDATE OR DELETE ON quiz_questions
  FOR EACH ROW EXECUTE FUNCTION course_content_guard();
--> statement-breakpoint
-- Une question et sa leçon appartiennent toujours à la même version.
CREATE FUNCTION quiz_question_lesson_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM lessons l WHERE l.id = NEW.lesson_id AND l.course_version_id = NEW.course_version_id
  ) THEN
    RAISE EXCEPTION 'course_version_immutable: la question et sa leçon doivent appartenir à la même version'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER quiz_questions_same_version BEFORE INSERT OR UPDATE ON quiz_questions
  FOR EACH ROW EXECUTE FUNCTION quiz_question_lesson_guard();
--> statement-breakpoint
CREATE FUNCTION quiz_attempts_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'quiz_attempts: tentatives en ajout seulement'
    USING ERRCODE = 'check_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER quiz_attempts_immutable BEFORE UPDATE OR DELETE ON quiz_attempts
  FOR EACH ROW EXECUTE FUNCTION quiz_attempts_append_only();
--> statement-breakpoint
CREATE TRIGGER quiz_responses_immutable BEFORE UPDATE OR DELETE ON quiz_responses
  FOR EACH ROW EXECUTE FUNCTION quiz_attempts_append_only();
