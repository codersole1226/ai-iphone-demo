import mysql from "mysql2/promise";

export const pool = mysql.createPool({
    host: process.env.MYSQL_HOST!,
    // port: Number(process.env.MYSQL_PORT || 3306),
    port: Number(process.env.MYSQL_PORT || 4000),
    user: process.env.MYSQL_USER!,
    password: process.env.MYSQL_PASSWORD!,
    database: process.env.MYSQL_DATABASE!,
    ssl: {
        rejectUnauthorized: true,
    },
    connectionLimit: 10,
});