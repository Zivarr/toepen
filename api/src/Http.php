<?php
declare(strict_types=1);

final class Request
{
    /** @var array<string,string> lower-cased header name => value */
    private array $headers = [];

    public function __construct(
        public readonly string $method,
        public readonly string $path,
        array $headers = [],
        public readonly ?array $json = null,
        public readonly array $query = [],
    ) {
        foreach ($headers as $name => $value) {
            $this->headers[strtolower((string)$name)] = (string)$value;
        }
    }

    public function header(string $name): ?string
    {
        return $this->headers[strtolower($name)] ?? null;
    }
}

final class Response
{
    public function __construct(
        public readonly int $status,
        public readonly ?array $body = null,
        public readonly array $headers = [],
    ) {
    }
}

final class ApiError extends Exception
{
    public function __construct(
        public readonly int $status,
        public readonly string $errorCode,
        string $message,
        public readonly ?array $extra = null,
    ) {
        parent::__construct($message);
    }
}
