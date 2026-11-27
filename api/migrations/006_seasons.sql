ALTER TABLE game_groups ADD COLUMN first_season_name VARCHAR(40) NULL;

CREATE TABLE seasons (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  group_id INT UNSIGNED NOT NULL,
  name VARCHAR(40) NULL,
  starts_at DATETIME NOT NULL,
  UNIQUE KEY uq_seasons_group_start (group_id, starts_at),
  CONSTRAINT fk_seasons_group FOREIGN KEY (group_id) REFERENCES game_groups (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
