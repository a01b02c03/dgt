<?php

declare(strict_types=1);

require_once __DIR__ . '/config.php';

function createDbConnection(): PDO
{
    $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', DB_HOST, DB_NAME);

    return new PDO($dsn, DB_USER, DB_PASS, [
        // Prepares reales en el servidor, no interpolación de cliente — cierra
        // cualquier resquicio de inyección SQL aunque se use un placeholder mal.
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        // Por defecto MySQL reporta filas CAMBIADAS en rowCount(), no filas
        // ENCONTRADAS por el WHERE — un UPDATE que reconfirma los mismos valores
        // (activate.php reconfirmando el mismo deviceId) daría rowCount()=0 y se
        // trataría como conflicto aunque la fila coincidiera. Este flag lo evita.
        PDO::MYSQL_ATTR_FOUND_ROWS => true,
    ]);
}
