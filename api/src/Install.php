<?php
declare(strict_types=1);

final class Install
{
    /** Creates the first admin, only when no users exist. Returns whether a user was created. */
    public static function run(PDO $pdo, string $username, string $password): bool
    {
        $username = trim($username);
        if ($username === '' || mb_strlen($username) > 60 || strlen($password) < 8) {
            return false;
        }
        if ((int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn() > 0) {
            return false;
        }
        $pdo->prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)')
            ->execute([$username, password_hash($password, PASSWORD_DEFAULT)]);
        return true;
    }
}
