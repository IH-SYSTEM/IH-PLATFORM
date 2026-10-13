-- 会社の書類を AI が振り分ける（2026-10-13 黒田さん「あらゆるものを入れる。過去のものも。そちらで振り分けて格納して」）。
-- まとめて入れた書類は、AI が中身を読んで「どの会社の・どの種類の・何という書類か・日付」を決める。
-- 同じ書類（例：定款、36協定）の版が複数あれば、日付の新しいものを「最新」、ほかを「過去」として並べる
alter table files add column if not exists doc_kind text check (char_length(doc_kind) <= 60);   -- 書類の名前（例：定款、36協定、第12期 決算書 → 「決算書」）。版をまとめる単位
alter table files add column if not exists ai_auto_company boolean not null default false;      -- 会社を AI に任せた
alter table files add column if not exists ai_auto_category boolean not null default false;     -- 種類・日付・名前を AI に任せた
create index if not exists files_company_kind_idx on files(owner_company_id, doc_kind, doc_date) where owner_company_id is not null;
