// Package banco abre a conexão com o PostgreSQL e aplica as migrações.
//
// Conceito Go: //go:embed copia os arquivos .sql para dentro do binário na
// hora de compilar. Assim o servidor é um arquivo só, sem depender da pasta
// de migrações existir no servidor de produção.
package banco

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"sort"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migracoes/*.sql
var migracoes embed.FS

// Conectar cria um pool de conexões. Um pool reaproveita conexões abertas
// entre as requisições, em vez de abrir uma nova a cada pedido.
func Conectar(ctx context.Context, url string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("DATABASE_URL inválida: %w", err)
	}
	cfg.MaxConns = 10

	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel() // defer roda quando a função retorna, aconteça o que acontecer

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("conectar ao banco: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("banco não respondeu: %w", err)
	}
	return pool, nil
}

// Migrar aplica, em ordem, os arquivos de migracoes/ que ainda não rodaram.
// Cada arquivo roda numa transação: ou entra inteiro, ou não entra nada.
func Migrar(ctx context.Context, pool *pgxpool.Pool) error {
	if _, err := pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		versao TEXT PRIMARY KEY,
		aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now()
	)`); err != nil {
		return fmt.Errorf("criar schema_migrations: %w", err)
	}

	arquivos, err := fs.Glob(migracoes, "migracoes/*.sql")
	if err != nil {
		return err
	}
	sort.Strings(arquivos) // 001_..., 002_..., na ordem do nome

	for _, arq := range arquivos {
		var existe bool
		if err := pool.QueryRow(ctx,
			`SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE versao = $1)`, arq,
		).Scan(&existe); err != nil {
			return err
		}
		if existe {
			continue
		}

		sql, err := migracoes.ReadFile(arq)
		if err != nil {
			return err
		}
		tx, err := pool.Begin(ctx)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, string(sql)); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("migração %s: %w", arq, err)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO schema_migrations (versao) VALUES ($1)`, arq); err != nil {
			_ = tx.Rollback(ctx)
			return err
		}
		if err := tx.Commit(ctx); err != nil {
			return err
		}
	}
	return nil
}
