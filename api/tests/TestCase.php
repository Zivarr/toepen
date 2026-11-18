<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    private static ?PDO $pdo = null;

    protected function setUp(): void
    {
        parent::setUp();
        $pdo = $this->pdo();
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
        $tables = $pdo->query(
            'SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()'
        )->fetchAll(PDO::FETCH_COLUMN);
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
        App::$extraRoutes = [];
    }

    public function pdo(): PDO
    {
        if (self::$pdo === null) {
            $dsn = sprintf(
                'mysql:host=%s;dbname=%s;charset=utf8mb4',
                getenv('DB_HOST') ?: 'mysql',
                getenv('TEST_DB_NAME') ?: 'toepen_test'
            );
            self::$pdo = new PDO($dsn, getenv('DB_USER') ?: 'toepen', getenv('DB_PASS') ?: 'toepen', [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
            self::$pdo->exec("SET time_zone = '+00:00'");
        }
        return self::$pdo;
    }

    /** @return array{id:int, token:string} */
    public function makeUser(string $username, bool $admin = false, string $password = 'geheim123'): array
    {
        $st = $this->pdo()->prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)');
        $st->execute([$username, password_hash($password, PASSWORD_DEFAULT), $admin ? 1 : 0]);
        $id = (int)$this->pdo()->lastInsertId();
        return ['id' => $id, 'token' => Auth::issueToken($this->pdo(), $id, 'test')];
    }

    public function call(
        string $method,
        string $path,
        ?array $json = null,
        ?string $token = null,
        array $headers = []
    ): Response {
        if ($token !== null) {
            $headers['Authorization'] = 'Bearer ' . $token;
        }
        return App::handle(new Request($method, $path, $headers, $json), $this->pdo());
    }
}
