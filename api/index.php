<?php
declare(strict_types=1);

require_once __DIR__ . '/src/bootstrap.php';

function emit(Response $res): void
{
    http_response_code($res->status);
    header('Content-Type: application/json; charset=utf-8');
    foreach ($res->headers as $name => $value) {
        header($name . ': ' . $value);
    }
    if ($res->body !== null && $res->status !== 204 && $res->status !== 304) {
        echo json_encode($res->body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
}

try {
    $config = require __DIR__ . '/config.php';
    $pdo = new PDO(
        'mysql:host=' . $config['db_host'] . ';dbname=' . $config['db_name'] . ';charset=utf8mb4',
        $config['db_user'],
        $config['db_pass'],
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );
    $pdo->exec("SET time_zone = '+00:00'");
} catch (Throwable $e) {
    error_log('Toepen API bootstrap error: ' . $e->getMessage());
    emit(new Response(500, ['error' => 'server_error', 'message' => 'Er ging iets mis op de server.']));
    exit;
}

$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$path = preg_replace('#^/api(?=/|$)#', '', $uri);
$path = $path === '' ? '/' : $path;

$headers = function_exists('getallheaders') ? (getallheaders() ?: []) : [];
$authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
if (!isset($headers['Authorization']) && $authHeader !== '') {
    $headers['Authorization'] = $authHeader;
}

$json = null;
$raw = file_get_contents('php://input');
if ($raw !== false && $raw !== '') {
    $decoded = json_decode($raw, true);
    if (is_array($decoded)) {
        $json = $decoded;
    } else {
        emit(new Response(400, ['error' => 'invalid_json', 'message' => 'Ongeldige JSON.']));
        exit;
    }
}

$req = new Request($_SERVER['REQUEST_METHOD'] ?? 'GET', $path, $headers, $json, $_GET);
emit(App::handle($req, $pdo));
