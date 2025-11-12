// index.js
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const dbPool = require('./db'); 

const app = express();
const port = 3000;

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }));
app.use(express.json());
app.use(express.static(__dirname)); 

app.get('/', (req, res) => {
    res.redirect('/index.html');
});

// ====================================================================
// ROTAS AUXILIARES E MATÉRIAS (Mantidas)
// ====================================================================

// ROTA para obter todas as matérias
app.get('/materias', async (req, res) => {
    try {
        const [materias] = await dbPool.execute('SELECT id_materia, nome_materia FROM Materias');
        res.json({ data: materias });
    } catch (error) {
        console.error('Erro ao buscar matérias:', error);
        res.status(500).json({ error: 'Erro ao buscar matérias.' });
    }
});

// ROTA: Adicionar nova matéria
app.post('/materias/nova', async (req, res) => {
    const { nome_materia } = req.body;
    if (!nome_materia) {
        return res.status(400).json({ error: 'O nome da matéria é obrigatório.' });
    }
    
    try {
        const [result] = await dbPool.execute(
            'INSERT INTO Materias (nome_materia) VALUES (?)',
            [nome_materia]
        );
        res.status(201).json({ 
            message: 'Matéria cadastrada com sucesso.', 
            id_materia: result.insertId,
            nome_materia: nome_materia
        });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Esta matéria já existe.' });
        }
        console.error('Erro ao cadastrar nova matéria:', error);
        res.status(500).json({ error: 'Erro interno ao cadastrar matéria.' });
    }
});


// ====================================================================
// ROTAS DE CRUD E AUTENTICAÇÃO (Mantidas)
// ====================================================================

// ROTA DE REGISTRO/CADASTRO
app.post('/auth/registrar', async (req, res) => {
    const { email, senha, tipo_usuario, nome, matricula, campo_especifico, id_materias } = req.body; 

    if (!email || !senha || !nome || !matricula || !tipo_usuario) {
        return res.status(400).json({ error: 'Dados básicos (email, senha, nome, matricula) são obrigatórios.' });
    }

    const connection = await dbPool.getConnection();
    try {
        await connection.beginTransaction();

        const salt = await bcrypt.genSalt(10);
        const senha_hash = await bcrypt.hash(senha, salt);

        const [userResult] = await connection.execute(
            'INSERT INTO Usuarios (email, senha_hash, tipo_usuario) VALUES (?, ?, ?)',
            [email, senha_hash, tipo_usuario]
        );
        const id_usuario_fk = userResult.insertId;

        let principalId;
        
        if (tipo_usuario === 'ESTUDANTE') {
            const [estudanteResult] = await connection.execute(
                'INSERT INTO Estudantes (nome, matricula, curso, id_usuario_fk) VALUES (?, ?, ?, ?)',
                [nome, matricula, campo_especifico, id_usuario_fk]
            );
            principalId = estudanteResult.insertId;
        } else if (tipo_usuario === 'PROFESSOR') {
            const [professorResult] = await connection.execute(
                'INSERT INTO Professores (nome, matricula, departamento, id_usuario_fk) VALUES (?, ?, ?, ?)',
                [nome, matricula, campo_especifico, id_usuario_fk]
            );
            principalId = professorResult.insertId;
        } else if (tipo_usuario === 'COORDENACAO') {
             const [coordResult] = await connection.execute(
                'INSERT INTO Coordenacao (nome, matricula, setor, id_usuario_fk) VALUES (?, ?, ?, ?)',
                [nome, matricula, campo_especifico, id_usuario_fk]
            );
            principalId = coordResult.insertId;
        }

        if (id_materias && (tipo_usuario === 'ESTUDANTE' || tipo_usuario === 'PROFESSOR')) {
            const pivotTable = tipo_usuario === 'ESTUDANTE' ? 'Estudante_Materia' : 'Professor_Materia';
            const pivotKey = tipo_usuario === 'ESTUDANTE' ? 'id_estudante' : 'id_professor';

            for (const id_materia of id_materias) {
                await connection.execute(
                    `INSERT INTO ${pivotTable} (${pivotKey}, id_materia) VALUES (?, ?)`,
                    [principalId, id_materia]
                );
            }
        }

        await connection.commit();
        res.status(201).json({ 
            message: `${tipo_usuario} registrado com sucesso.`,
            id: principalId
        });

    } catch (error) {
        await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'E-mail ou Matrícula já cadastrados.' });
        }
        console.error('Erro ao registrar usuário completo:', error);
        res.status(500).json({ error: 'Erro interno ao registrar usuário.', details: error.message });
    } finally {
        connection.release();
    }
});

// ROTA DE LOGIN
app.post('/auth/login', async (req, res) => {
    const { email, senha } = req.body;

    if (!email || !senha) {
        return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    try {
        const [users] = await dbPool.execute(
            'SELECT id_usuario, senha_hash, tipo_usuario FROM Usuarios WHERE email = ?',
            [email]
        );

        const user = users[0];

        if (!user) {
            return res.status(401).json({ error: 'Credenciais inválidas: E-mail não encontrado.' });
        }

        const isMatch = await bcrypt.compare(senha, user.senha_hash);

        if (!isMatch) {
            return res.status(401).json({ error: 'Credenciais inválidas: Senha incorreta.' });
        }

        res.json({
            message: 'Login bem-sucedido!',
            id_usuario: user.id_usuario,
            tipo_usuario: user.tipo_usuario
        });

    } catch (error) {
        console.error('Erro ao fazer login:', error);
        res.status(500).json({ error: 'Erro interno do servidor ao fazer login.', details: error.message });
    }
});


// ROTA DE EDIÇÃO COMPLETA
app.put('/usuarios/editar/:idUsuario', async (req, res) => {
    const idUsuario = req.params.idUsuario;
    const { email, nova_senha, nome, matricula, campo_especifico, id_materias, tipo_usuario } = req.body;

    if (!nome || !matricula || !tipo_usuario || !email) {
        return res.status(400).json({ error: 'Email, Nome, Matrícula e Tipo de Usuário são obrigatórios.' });
    }

    const connection = await dbPool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Atualizar a tabela Usuarios (Email e Senha)
        let updateUsuarioQuery = 'UPDATE Usuarios SET email = ?';
        let usuarioParams = [email];
        
        if (nova_senha) {
            const salt = await bcrypt.genSalt(10);
            const senha_hash = await bcrypt.hash(nova_senha, salt);
            updateUsuarioQuery += ', senha_hash = ?';
            usuarioParams.push(senha_hash);
        }
        
        updateUsuarioQuery += ' WHERE id_usuario = ?';
        usuarioParams.push(idUsuario);
        
        await connection.execute(updateUsuarioQuery, usuarioParams);

        // 2. Lógica para tabelas filhas
        let tableName;
        let idKey;
        let campoDB;

        if (tipo_usuario === 'ESTUDANTE') {
            tableName = 'Estudantes';
            idKey = 'id_estudante';
            campoDB = 'curso';
        } else if (tipo_usuario === 'PROFESSOR') {
            tableName = 'Professores';
            idKey = 'id_professor';
            campoDB = 'departamento';
        } else if (tipo_usuario === 'COORDENACAO') {
            tableName = 'Coordenacao';
            idKey = 'id_coordenador';
            campoDB = 'setor';
        } else {
            await connection.rollback();
            return res.status(400).json({ error: 'Tipo de Usuário inválido.' });
        }

        const [principalResult] = await connection.execute(
            `SELECT ${idKey} FROM ${tableName} WHERE id_usuario_fk = ?`,
            [idUsuario]
        );
        
        if (principalResult.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Usuário principal não encontrado para edição. Verifique o tipo_usuario.' });
        }
        const principalId = principalResult[0][idKey];


        // 2b. Atualizar a tabela principal (Nome, Matrícula, Campo Específico)
        await connection.execute(
            `UPDATE ${tableName} SET nome = ?, matricula = ?, ${campoDB} = ? WHERE ${idKey} = ?`,
            [nome, matricula, campo_especifico, principalId]
        );

        // 2c. Atualizar Matérias (se aplicável)
        if (tipo_usuario === 'ESTUDANTE' || tipo_usuario === 'PROFESSOR') {
            const pivotTable = tipo_usuario === 'ESTUDANTE' ? 'Estudante_Materia' : 'Professor_Materia';
            const pivotKey = tipo_usuario === 'ESTUDANTE' ? 'id_estudante' : 'id_professor';

            await connection.execute(`DELETE FROM ${pivotTable} WHERE ${pivotKey} = ?`, [principalId]);

            if (id_materias && id_materias.length > 0) {
                 for (const id_materia of id_materias) {
                    await connection.execute(
                        `INSERT INTO ${pivotTable} (${pivotKey}, id_materia) VALUES (?, ?)`,
                        [principalId, id_materia]
                    );
                }
            }
        }

        await connection.commit();
        res.json({ message: `Usuário ID ${idUsuario} (${tipo_usuario}) atualizado com sucesso.` });

    } catch (error) {
        await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'E-mail ou Matrícula já cadastrados.' });
        }
        console.error('Erro ao editar usuário:', error);
        res.status(500).json({ error: 'Erro interno ao editar usuário.', details: error.message });
    } finally {
        connection.release();
    }
});


// ROTA: Exclusão de Usuário
app.delete('/usuarios/excluir/:idUsuario', async (req, res) => {
    const idUsuario = req.params.idUsuario;
    
    const connection = await dbPool.getConnection();
    try {
        await connection.beginTransaction();

        const [result] = await connection.execute(
            'DELETE FROM Usuarios WHERE id_usuario = ?',
            [idUsuario]
        );

        if (result.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }

        await connection.commit();
        res.json({ message: `Usuário ID ${idUsuario} excluído com sucesso.` });

    } catch (error) {
        await connection.rollback();
        console.error('Erro ao excluir usuário:', error);
        res.status(500).json({ error: 'Erro interno ao excluir usuário.', details: error.message });
    } finally {
        connection.release();
    }
});

// ROTA: Buscar Detalhes do Usuário
app.post('/usuarios/buscar_detalhes', async (req, res) => {
    const { email, matricula, tipo_usuario } = req.body;

    if (!email || !matricula || !tipo_usuario) {
        return res.status(400).json({ error: 'Email, Matrícula e Tipo de Usuário são obrigatórios para a consulta.' });
    }

    try {
        let tableName;
        let campoBusca = '';

        if (tipo_usuario === 'ESTUDANTE') {
            tableName = 'Estudantes';
            campoBusca = 'curso';
        } else if (tipo_usuario === 'PROFESSOR') {
            tableName = 'Professores';
            campoBusca = 'departamento';
        } else if (tipo_usuario === 'COORDENACAO') {
            tableName = 'Coordenacao';
            campoBusca = 'setor';
        } else {
            return res.status(400).json({ error: 'Tipo de Usuário inválido.' });
        }

        const [results] = await dbPool.execute(
            `SELECT P.nome, P.matricula, P.${campoBusca} as campo_especifico, U.email, U.id_usuario 
             FROM ${tableName} P 
             JOIN Usuarios U ON P.id_usuario_fk = U.id_usuario
             WHERE U.email = ? AND P.matricula = ?`,
            [email, matricula]
        );

        if (results.length === 0) {
            return res.status(404).json({ message: 'Usuário não encontrado com as credenciais fornecidas.' });
        }
        
        const userData = results[0];
        userData.tipo_usuario = tipo_usuario;
        
        if (tipo_usuario === 'ESTUDANTE' || tipo_usuario === 'PROFESSOR') {
            const pivotTable = tipo_usuario === 'ESTUDANTE' ? 'Estudante_Materia' : 'Professor_Materia';
            const pivotKey = tipo_usuario === 'ESTUDANTE' ? 'id_estudante' : 'id_professor';

            const [principalIdResult] = await dbPool.execute(
                `SELECT ${pivotKey} FROM ${tableName} WHERE id_usuario_fk = ?`,
                [userData.id_usuario]
            );

            if (principalIdResult.length > 0) {
                 const principalId = principalIdResult[0][pivotKey];
                 const [materias] = await dbPool.execute(
                    `SELECT id_materia FROM ${pivotTable} WHERE ${pivotKey} = ?`,
                    [principalId]
                );
                userData.id_materias = materias.map(m => m.id_materia);
            }
        }
        
        res.json({ message: 'Detalhes do usuário encontrados.', data: userData });

    } catch (error) {
        console.error('Erro ao buscar detalhes do usuário:', error);
        res.status(500).json({ error: 'Erro interno ao buscar detalhes do usuário.' });
    }
});


// ====================================================================
// ROTAS DE CONSULTA POR MATÉRIA (ID ADICIONADO)
// ====================================================================

// ROTA: Consultar Estudantes por Matéria ou Todos
app.get('/estudantes/por_materia/:idMateria', async (req, res) => {
    const idMateria = parseInt(req.params.idMateria);
    let query;
    let params = [];

    if (idMateria === 0) { // TODAS AS MATÉRIAS
        query = `
            SELECT E.id_estudante, E.nome, E.matricula, U.email, E.curso
            FROM Estudantes E
            JOIN Usuarios U ON E.id_usuario_fk = U.id_usuario
        `;
    } else { // MATÉRIA ESPECÍFICA
        query = `
            SELECT E.id_estudante, E.nome, E.matricula, U.email, E.curso
            FROM Estudantes E
            JOIN Usuarios U ON E.id_usuario_fk = U.id_usuario
            JOIN Estudante_Materia EM ON E.id_estudante = EM.id_estudante
            WHERE EM.id_materia = ?
        `;
        params.push(idMateria);
    }

    try {
        const [rows] = await dbPool.execute(query, params);
        res.json({ data: rows });
    } catch (error) {
        console.error('Erro ao consultar estudantes:', error);
        res.status(500).json({ error: 'Erro interno ao consultar estudantes.' });
    }
});

// ROTA: Consultar Professores por Matéria ou Todos
app.get('/professores/por_materia/:idMateria', async (req, res) => {
    const idMateria = parseInt(req.params.idMateria);
    let query;
    let params = [];

    if (idMateria === 0) { // TODAS AS MATÉRIAS
        query = `
            SELECT P.id_professor, P.nome, P.matricula, U.email, P.departamento
            FROM Professores P
            JOIN Usuarios U ON P.id_usuario_fk = U.id_usuario
        `;
    } else { // MATÉRIA ESPECÍFICA
        query = `
            SELECT P.id_professor, P.nome, P.matricula, U.email, P.departamento
            FROM Professores P
            JOIN Usuarios U ON P.id_usuario_fk = U.id_usuario
            JOIN Professor_Materia PM ON P.id_professor = PM.id_professor
            WHERE PM.id_materia = ?
        `;
        params.push(idMateria);
    }

    try {
        const [rows] = await dbPool.execute(query, params);
        res.json({ data: rows });
    } catch (error) {
        console.error('Erro ao consultar professores:', error);
        res.status(500).json({ error: 'Erro interno ao consultar professores.' });
    }
});


// Inicia o servidor
app.listen(port, () => {
    console.log(`API rodando em http://localhost:${port}`);
    console.log(`Frontend abrindo em http://localhost:${port}/index.html`);
});