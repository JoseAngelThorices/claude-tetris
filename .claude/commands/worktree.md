---
description: Crea un git worktree en .trees/<nombre> y ejecuta el requerimiento de forma aislada dentro de él
argument-hint: <requerimiento a implementar>
allowed-tools: Bash(git worktree:*), Bash(git -C:*), Bash(git rev-parse:*), Bash(git status:*), Bash(git branch:*), Bash(ls:*), Bash(mkdir:*), Read, Edit, Write, Glob, Grep
---

# /worktree

Requerimiento recibido:

<requerimiento>
$ARGUMENTS
</requerimiento>

Si el requerimiento está vacío, pide al usuario que lo describa y detente.

## 1. Determinar el nombre del worktree

Deriva un nombre a partir del requerimiento:

- kebab-case, 2 a 4 palabras, máximo 30 caracteres.
- Solo `a-z`, `0-9` y `-` (sin acentos, sin `ñ`, sin espacios).
- Descriptivo de la tarea, con prefijo de tipo cuando aplique: `feat-`, `fix-`, `refactor-`, `docs-`, `chore-`.
  - Ejemplos: "añadir botón de reinicio" → `feat-boton-reinicio`; "arreglar rotación de la pieza I" → `fix-rotacion-pieza-i`.
- Si `.trees/<nombre>` ya existe o ya existe una rama con ese nombre (`git branch --list <nombre>`), añade un sufijo `-2`, `-3`, etc.

## 2. Crear el worktree

Ejecuta desde la raíz del proyecto (el directorio que contiene este `.claude/`):

```bash
git worktree add .trees/<nombre>
```

Git crea automáticamente la rama `<nombre>` a partir del `HEAD` actual.

Después:

- Comprueba que `.trees/` figura en el `.gitignore` del proyecto; si no, añádelo.
- Verifica con `git worktree list` que el worktree existe.
- Guarda la ruta absoluta del worktree: `WT=<raíz del proyecto>/.trees/<nombre>`.

Si `git worktree add` falla, muestra el error exacto y detente. No intentes alternativas que toquen el código principal.

## 3. Ejecutar el requerimiento de forma aislada

Reglas obligatorias durante toda la tarea:

- Todo `Read`, `Edit` y `Write` usa rutas absolutas bajo `$WT`. Nunca edites archivos fuera de `$WT`.
- Todo comando `git` usa `git -C "$WT" ...`. Todo comando de shell se ejecuta con `cd "$WT" && ...`.
- Busca código (`Glob`, `Grep`) solo dentro de `$WT`.
- No modifiques, hagas checkout ni stash en el árbol de trabajo principal.
- Sigue las convenciones del `CLAUDE.md` que haya dentro de `$WT`.

Implementa el requerimiento completo dentro de `$WT`.

## 4. Cierre

No hagas commit salvo que el requerimiento lo pida. Al terminar, informa:

- Nombre del worktree, ruta y rama.
- Resumen de los cambios (`git -C "$WT" status --short`).
- Cómo integrar o descartar el trabajo:

```bash
git merge <nombre>                      # integrar en la rama actual (tras hacer commit en el worktree)
git worktree remove .trees/<nombre>     # eliminar el worktree
git branch -D <nombre>                  # eliminar la rama
```
