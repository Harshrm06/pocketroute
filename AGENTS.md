# AGENTS.md

- PRD.md in the project root is the source of truth. Read the sections named in each task before coding.
- If code and PRD.md disagree, update PRD.md first (with a changelog entry), then the code.
- Never invent transit data, coordinates, route numbers, or fares. If something cannot be verified, keep it in the data files with "verified": false and report it.
- Run the verification commands listed in each task. Do not start the next task until they pass.
- Do not add dependencies outside the stack in PRD Section 11.1 without recording the reason in PRD.md.
- Keep algorithm code in packages/engine free of I/O.
