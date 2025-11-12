// db.js
const mysql = require('mysql2/promise');

const config = {
    host: 'localhost',
    user: 'root', 
    password: 'senai', // <-- SUBSTITUA PELA SUA SENHA
    database: 'gerenciamento_escolar', // Nome do database
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

const pool = mysql.createPool(config);

module.exports = pool;