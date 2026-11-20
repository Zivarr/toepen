CREATE TABLE users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(60) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_admin TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  disabled_at DATETIME NULL,
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE auth_tokens (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  device_name VARCHAR(100) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME NULL,
  revoked_at DATETIME NULL,
  UNIQUE KEY uq_auth_tokens_hash (token_hash),
  KEY idx_auth_tokens_user (user_id),
  CONSTRAINT fk_auth_tokens_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE login_attempts (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(60) NOT NULL,
  attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_login_attempts (username, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE game_groups (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  created_by INT UNSIGNED NOT NULL,
  max_penalty_points INT NOT NULL DEFAULT 10,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_groups_creator FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE group_members (
  group_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  added_by INT UNSIGNED NULL,
  added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, user_id),
  CONSTRAINT fk_members_group FOREIGN KEY (group_id) REFERENCES game_groups (id),
  CONSTRAINT fk_members_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_members_added_by FOREIGN KEY (added_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE players (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  group_id INT UNSIGNED NOT NULL,
  name VARCHAR(40) NOT NULL,
  merged_into_player_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_players_group_name (group_id, name),
  CONSTRAINT fk_players_group FOREIGN KEY (group_id) REFERENCES game_groups (id),
  CONSTRAINT fk_players_merged FOREIGN KEY (merged_into_player_id) REFERENCES players (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE games (
  id CHAR(36) NOT NULL PRIMARY KEY,
  group_id INT UNSIGNED NOT NULL,
  recorded_by INT UNSIGNED NOT NULL,
  started_at DATETIME NOT NULL,
  received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  duration_ms BIGINT UNSIGNED NOT NULL,
  max_penalty_points INT NOT NULL,
  ended_early TINYINT(1) NOT NULL DEFAULT 0,
  winner_player_id INT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  deleted_by INT UNSIGNED NULL,
  KEY idx_games_group (group_id, started_at),
  CONSTRAINT fk_games_group FOREIGN KEY (group_id) REFERENCES game_groups (id),
  CONSTRAINT fk_games_recorder FOREIGN KEY (recorded_by) REFERENCES users (id),
  CONSTRAINT fk_games_winner FOREIGN KEY (winner_player_id) REFERENCES players (id),
  CONSTRAINT fk_games_deleter FOREIGN KEY (deleted_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE game_players (
  game_id CHAR(36) NOT NULL,
  player_id INT UNSIGNED NOT NULL,
  seat TINYINT UNSIGNED NOT NULL,
  final_score INT NOT NULL,
  boer_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (game_id, seat),
  UNIQUE KEY uq_game_players_player (game_id, player_id),
  KEY idx_game_players_player (player_id),
  CONSTRAINT fk_gp_game FOREIGN KEY (game_id) REFERENCES games (id),
  CONSTRAINT fk_gp_player FOREIGN KEY (player_id) REFERENCES players (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE sync_requests (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  requested_by INT UNSIGNED NOT NULL,
  source ENUM('pwa','android') NOT NULL,
  group_name VARCHAR(100) NOT NULL,
  payload JSON NOT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  resolved_group_id INT UNSIGNED NULL,
  resolved_by INT UNSIGNED NULL,
  resolved_at DATETIME NULL,
  reject_reason VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_sync_requested_by (requested_by),
  KEY idx_sync_status (status),
  CONSTRAINT fk_sync_requester FOREIGN KEY (requested_by) REFERENCES users (id),
  CONSTRAINT fk_sync_group FOREIGN KEY (resolved_group_id) REFERENCES game_groups (id),
  CONSTRAINT fk_sync_resolver FOREIGN KEY (resolved_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
