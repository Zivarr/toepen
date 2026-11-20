<?php
declare(strict_types=1);

// One-time setup: creates the first admin. Delete this file from the server afterwards.
ini_set('display_errors', '0');
require_once __DIR__ . '/src/bootstrap.php';

$config = require __DIR__ . '/config.php';
$pdo = new PDO(
    'mysql:host=' . $config['db_host'] . ';dbname=' . $config['db_name'] . ';charset=utf8mb4',
    $config['db_user'],
    $config['db_pass'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);
$pdo->exec("SET time_zone = '+00:00'");

header('Content-Type: text/html; charset=utf-8');
$message = '';
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $ok = Install::run($pdo, (string)($_POST['username'] ?? ''), (string)($_POST['password'] ?? ''));
    $message = $ok
        ? 'Beheerder aangemaakt. Verwijder nu install.php van de server.'
        : 'Niet aangemaakt: er bestaat al een gebruiker, of de invoer is ongeldig (wachtwoord minimaal 8 tekens).';
}
?>
<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Toepen installatie</title></head>
<body>
<h1>Eerste beheerder aanmaken</h1>
<?php if ($message !== ''): ?><p><?= htmlspecialchars($message, ENT_QUOTES, 'UTF-8') ?></p><?php endif; ?>
<form method="post">
  <p><label>Gebruikersnaam <input name="username" required maxlength="60"></label></p>
  <p><label>Wachtwoord (min. 8 tekens) <input name="password" type="password" required minlength="8"></label></p>
  <p><button type="submit">Aanmaken</button></p>
</form>
</body></html>
