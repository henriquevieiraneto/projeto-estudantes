-- setup_mysql.sql

-- 1. Cria e Seleciona o Database
CREATE DATABASE IF NOT EXISTS gerenciamento_escolar;
USE gerenciamento_escolar;

---
-- 2. Tabela BASE DE USUÁRIOS (Autenticação e Login)
CREATE TABLE Usuarios (
    id_usuario INT PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(100) UNIQUE NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    tipo_usuario ENUM('ESTUDANTE', 'PROFESSOR', 'COORDENACAO') NOT NULL
);

---
-- 3. Tabela MATÉRIAS
CREATE TABLE Materias (
    id_materia INT PRIMARY KEY AUTO_INCREMENT,
    nome_materia VARCHAR(100) UNIQUE NOT NULL
);

-- Inserção de Matérias de Exemplo (Para evitar o erro 500 inicial)
INSERT INTO Materias (nome_materia) VALUES
('Banco de Dados'),
('Programação Web'),
('Cálculo I'),
('Direito Civil');

---
-- 4. Tabela ESTUDANTES (Dados Detalhados)
CREATE TABLE Estudantes (
    id_estudante INT PRIMARY KEY AUTO_INCREMENT,
    nome VARCHAR(100) NOT NULL,
    matricula VARCHAR(20) UNIQUE NOT NULL,
    curso VARCHAR(50) NOT NULL,
    id_usuario_fk INT UNIQUE,
    -- CHAVE ESTRANGEIRA COM ON DELETE CASCADE
    FOREIGN KEY (id_usuario_fk) REFERENCES Usuarios(id_usuario) ON DELETE CASCADE
);

---
-- 5. Tabela PROFESSORES (Dados Detalhados)
CREATE TABLE Professores (
    id_professor INT PRIMARY KEY AUTO_INCREMENT,
    nome VARCHAR(100) NOT NULL,
    matricula VARCHAR(20) UNIQUE NOT NULL,
    departamento VARCHAR(50),
    id_usuario_fk INT UNIQUE,
    -- CHAVE ESTRANGEIRA COM ON DELETE CASCADE
    FOREIGN KEY (id_usuario_fk) REFERENCES Usuarios(id_usuario) ON DELETE CASCADE
);

---
-- 6. Tabela COORDENACAO (Dados Detalhados)
CREATE TABLE Coordenacao (
    id_coordenador INT PRIMARY KEY AUTO_INCREMENT,
    nome VARCHAR(100) NOT NULL,
    matricula VARCHAR(20) UNIQUE NOT NULL,
    setor VARCHAR(50),
    id_usuario_fk INT UNIQUE,
    -- CHAVE ESTRANGEIRA COM ON DELETE CASCADE
    FOREIGN KEY (id_usuario_fk) REFERENCES Usuarios(id_usuario) ON DELETE CASCADE
);

---
-- 7. Tabela PIVÔ: Relacionamento Estudante-Matéria (M:N)
CREATE TABLE Estudante_Materia (
    id_estudante INT,
    id_materia INT,
    PRIMARY KEY (id_estudante, id_materia),
    -- CHAVE ESTRANGEIRA COM ON DELETE CASCADE
    FOREIGN KEY (id_estudante) REFERENCES Estudantes(id_estudante) ON DELETE CASCADE,
    FOREIGN KEY (id_materia) REFERENCES Materias(id_materia) ON DELETE CASCADE
);

---
-- 8. Tabela PIVÔ: Relacionamento Professor-Matéria (M:N)
CREATE TABLE Professor_Materia (
    id_professor INT,
    id_materia INT,
    PRIMARY KEY (id_professor, id_materia),
    -- CHAVE ESTRANGEIRA COM ON DELETE CASCADE
    FOREIGN KEY (id_professor) REFERENCES Professores(id_professor) ON DELETE CASCADE,
    FOREIGN KEY (id_materia) REFERENCES Materias(id_materia) ON DELETE CASCADE
);

---
-- Stored Procedures ORIGINAIS (Adaptadas para a nova estrutura de tabelas)

DELIMITER $$

-- PROCEDIMENTO 1: Atualizar e Consultar o Estudante
CREATE PROCEDURE atualizar_dados_estudante(
    IN p_id_usuario INT,
    IN p_nome VARCHAR(100),
    IN p_matricula VARCHAR(20),
    IN p_curso VARCHAR(50)
)
BEGIN
    UPDATE Estudantes
    SET
        nome = p_nome,
        matricula = p_matricula,
        curso = p_curso
    WHERE id_usuario_fk = p_id_usuario;

    SELECT E.*, U.email
    FROM Estudantes E
    JOIN Usuarios U ON E.id_usuario_fk = U.id_usuario
    WHERE E.id_usuario_fk = p_id_usuario;
END$$

---

-- PROCEDIMENTO 2: Deletar e Consultar a Tabela
CREATE PROCEDURE deletar_estudante_e_consultar(
    IN p_id_usuario INT
)
BEGIN
    -- Deleta o registro na tabela Estudantes (a exclusão do Usuário deve ser feita via Node.js/API)
    DELETE FROM Estudantes
    WHERE id_usuario_fk = p_id_usuario;

    -- Retorna a lista atualizada de todos os estudantes
    SELECT E.nome, E.matricula, E.curso, U.email
    FROM Estudantes E
    JOIN Usuarios U ON E.id_usuario_fk = U.id_usuario;
END$$

---

-- PROCEDIMENTO 3: Retornar Quantidade de Estudantes por Curso
CREATE PROCEDURE contar_estudantes_por_curso()
BEGIN
    SELECT
        curso,
        COUNT(id_estudante) AS total_estudantes
    FROM Estudantes
    GROUP BY curso
    ORDER BY total_estudantes DESC, curso ASC;
END$$

DELIMITER ;