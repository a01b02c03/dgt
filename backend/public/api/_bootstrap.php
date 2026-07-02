<?php

declare(strict_types=1);

// Helpers compartidos por los endpoints de backend/public/api/. No expone
// nada por sí mismo — cada endpoint decide qué método acepta y qué datos lee.

header('Content-Type: application/json; charset=utf-8');

function requireMethod(string $method): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== $method) {
        errorJson('método no permitido', 405);
    }
}

/** @return array<string, mixed> */
function jsonInput(): array
{
    $raw = file_get_contents('php://input') ?: '';
    if ($raw === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function clientIp(): string
{
    return is_string($_SERVER['REMOTE_ADDR'] ?? null) ? $_SERVER['REMOTE_ADDR'] : 'unknown';
}

/** @param array<string, mixed> $data */
function respondJson(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_THROW_ON_ERROR);
    exit;
}

function errorJson(string $message, int $status): never
{
    respondJson(['error' => $message], $status);
}
