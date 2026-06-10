CREATE TABLE IF NOT EXISTS comment_votes (
    id SERIAL PRIMARY KEY,
    comment_id INT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    guest_token TEXT,
    vote_type VARCHAR(10) NOT NULL CHECK (vote_type IN ('like', 'dislike')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_comment_votes_actor CHECK (user_id IS NOT NULL OR guest_token IS NOT NULL),
    CONSTRAINT chk_comment_votes_actor_exclusive CHECK (NOT (user_id IS NOT NULL AND guest_token IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_comment_votes_user_unique
    ON comment_votes (comment_id, user_id)
    WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_comment_votes_guest_unique
    ON comment_votes (comment_id, guest_token)
    WHERE guest_token IS NOT NULL;