<?php
declare(strict_types=1);

// Resets the DEV database (config.php) for the Playwright e2e tests. NOT the PHPUnit test DB.
// Usage: docker compose exec -T -e TOEPEN_E2E_SEED=1 php php api/tests/seed_e2e.php
// Production uses the same db name/host, so the explicit TOEPEN_E2E_SEED=1 opt-in is required too.

if (getenv('TOEPEN_E2E_SEED') !== '1') {
    fwrite(STDERR, "Refusing to seed: set TOEPEN_E2E_SEED=1 to confirm this is the local dev database.
");
    exit(1);
}

$config = require __DIR__ . '/../config.php';
$allowedHosts = ['mysql', 'localhost', '127.0.0.1'];
$testDb = getenv('TEST_DB_NAME');
if (
    $config['db_name'] !== 'toepen'
    || !in_array($config['db_host'], $allowedHosts, true)
    || $config['db_name'] === 'toepen_test'
    || ($testDb !== false && $testDb !== '' && $config['db_name'] === $testDb)
) {
    fwrite(STDERR, "Refusing to seed: only the local dev database 'toepen' on host mysql/localhost/127.0.0.1 may be reset (got "
        . $config['db_name'] . '@' . $config['db_host'] . ")
");
    exit(1);
}

$pdo = new PDO(
    'mysql:host=' . $config['db_host'] . ';dbname=' . $config['db_name'] . ';charset=utf8mb4',
    $config['db_user'],
    $config['db_pass'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);

$pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
$tables = $pdo->query('SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()')
    ->fetchAll(PDO::FETCH_COLUMN);
foreach ($tables as $t) {
    $pdo->exec('DROP TABLE IF EXISTS `' . $t . '`');
}
$pdo->exec('SET FOREIGN_KEY_CHECKS = 1');

$files = glob(__DIR__ . '/../migrations/*.sql') ?: [];
sort($files);
foreach ($files as $file) {
    foreach (explode(';', (string)file_get_contents($file)) as $stmt) {
        if (trim($stmt) !== '') {
            $pdo->exec($stmt);
        }
    }
}

function makeUser(PDO $pdo, string $name, string $password, bool $admin): int
{
    $st = $pdo->prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)');
    $st->execute([$name, password_hash($password, PASSWORD_DEFAULT), $admin ? 1 : 0]);
    return (int)$pdo->lastInsertId();
}

$admin = makeUser($pdo, 'admin', 'admin1234', true);
$tim = makeUser($pdo, 'tim', 'tim12345', false);

$pdo->prepare('INSERT INTO game_groups (name, created_by, max_penalty_points) VALUES (?, ?, 10)')->execute(['Work', $admin]);
$group = (int)$pdo->lastInsertId();
$pdo->prepare('INSERT INTO group_members (group_id, user_id, added_by) VALUES (?, ?, ?)')->execute([$group, $tim, $admin]);
foreach (['Ravi', 'Kees', 'Sanne'] as $p) {
    $pdo->prepare('INSERT INTO players (group_id, name) VALUES (?, ?)')->execute([$group, $p]);
}

echo "e2e seed done\n";
