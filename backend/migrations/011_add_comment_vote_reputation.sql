CREATE OR REPLACE FUNCTION adjust_comment_vote_reputation(
    p_comment_id INT,
    p_vote_type TEXT,
    p_actor_user_id INT,
    p_direction INT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_author_id INT;
    v_actor_reputation INT := 0;
    v_vote_points INT := 10;
    v_delta INT := 0;
BEGIN
    SELECT user_id
    INTO v_author_id
    FROM comments
    WHERE id = p_comment_id;

    IF v_author_id IS NULL THEN
        RETURN;
    END IF;

    IF p_actor_user_id IS NOT NULL THEN
        SELECT COALESCE(reputation_score, 0)
        INTO v_actor_reputation
        FROM users
        WHERE id = p_actor_user_id;
    END IF;

    IF v_actor_reputation >= 100 THEN
        v_vote_points := 20;
    END IF;

    v_delta := v_vote_points * p_direction;

    IF LOWER(COALESCE(p_vote_type, '')) = 'dislike' THEN
        v_delta := -v_delta;
    END IF;

    UPDATE users
    SET reputation_score = COALESCE(reputation_score, 0) + v_delta
    WHERE id = v_author_id;
END;
$$;

CREATE OR REPLACE FUNCTION trg_sync_comment_vote_reputation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM adjust_comment_vote_reputation(NEW.comment_id, NEW.vote_type, NEW.user_id, 1);
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        PERFORM adjust_comment_vote_reputation(OLD.comment_id, OLD.vote_type, OLD.user_id, -1);
        PERFORM adjust_comment_vote_reputation(NEW.comment_id, NEW.vote_type, NEW.user_id, 1);
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM adjust_comment_vote_reputation(OLD.comment_id, OLD.vote_type, OLD.user_id, -1);
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_comment_votes_reputation ON comment_votes;

CREATE TRIGGER trg_comment_votes_reputation
AFTER INSERT OR UPDATE OR DELETE ON comment_votes
FOR EACH ROW
EXECUTE FUNCTION trg_sync_comment_vote_reputation();