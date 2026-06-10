CREATE TABLE IF NOT EXISTS reaction_logs (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(10) NOT NULL, -- 'like', 'dislike'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reaction_logs_spam
ON reaction_logs (user_id, created_at);

CREATE TABLE IF NOT EXISTS comment_reactions (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    comment_id INT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    reaction_type VARCHAR(10) NOT NULL CHECK (reaction_type IN ('like','dislike')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, comment_id)
);


CREATE OR REPLACE FUNCTION trg_handle_reaction_reputation()
RETURNS TRIGGER AS $$
DECLARE
    author_id INT;
    reactor_rep INT;
    multiplier INT := 1;
    points INT;
BEGIN
    SELECT user_id INTO author_id
    FROM comments
    WHERE id = COALESCE(NEW.comment_id, OLD.comment_id);

    IF author_id IS NULL THEN
        RETURN NULL;
    END IF;
    IF TG_OP = 'INSERT' THEN
        IF EXISTS (
            SELECT 1
            FROM reaction_logs
            WHERE user_id = NEW.user_id
              AND created_at > NOW() - INTERVAL '3 seconds'
        ) THEN
            RAISE EXCEPTION 'Anti-spam: Please wait 3 seconds before reacting again';
        END IF;
        INSERT INTO reaction_logs (user_id, action)
        VALUES (NEW.user_id, NEW.reaction_type);

    END IF;

    SELECT COALESCE(reputation_score, 0)
    INTO reactor_rep
    FROM users
    WHERE id = COALESCE(NEW.user_id, OLD.user_id);

    IF reactor_rep >= 100 THEN
        multiplier := 2;
    ELSE
        multiplier := 1;
    END IF;

    points := 10 * multiplier;
    IF TG_OP = 'INSERT' THEN
        IF NEW.reaction_type = 'like' THEN
            UPDATE users
            SET reputation_score = COALESCE(reputation_score, 0) + points
            WHERE id = author_id;
        END IF;

    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.reaction_type = 'like' THEN
            UPDATE users
            SET reputation_score = COALESCE(reputation_score, 0) - points
            WHERE id = author_id;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.reaction_type = 'like' AND NEW.reaction_type = 'dislike' THEN
            UPDATE users
            SET reputation_score = COALESCE(reputation_score, 0) - points
            WHERE id = author_id;
        END IF;
        IF OLD.reaction_type = 'dislike' AND NEW.reaction_type = 'like' THEN
            UPDATE users
            SET reputation_score = COALESCE(reputation_score, 0) + points
            WHERE id = author_id;
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_reaction_changed ON comment_reactions;
CREATE TRIGGER on_reaction_changed
AFTER INSERT OR DELETE OR UPDATE ON comment_reactions
FOR EACH ROW
EXECUTE FUNCTION trg_handle_reaction_reputation();