-- Level Wiki · Phase 4 초기 스키마
--
-- Supabase 대시보드 → SQL Editor에 이 파일 내용을 붙여 넣고 실행한다.
-- 개념 본문은 저장소의 JSON 파일에 그대로 두고, DB에는 사용자별 상태만 담는다.
-- 그래서 concept_slug에 외래키를 걸지 않는다. 콘텐츠는 git이, 학습 기록은 DB가 맡는다.

-- ────────────────────────────────────────────────
-- 1. 사용자별 개념 학습 상태
-- ────────────────────────────────────────────────
-- 저장(북마크)과 진도를 한 행에 둔다. 둘은 1:1이고, 목록 화면에서 늘 함께
-- 필요하므로 나누면 매번 조인해야 한다.
--   saved_at IS NULL  → 저장하지 않았지만 진도만 있는 상태(추후 확장용)
--   understanding     → Phase 7(취약 개념 분석)에서 채운다. 그때까지 NULL.

create table if not exists public.user_concepts (
  user_id          uuid        not null references auth.users (id) on delete cascade,
  concept_slug     text        not null,
  saved_at         timestamptz,
  last_level       smallint    not null default 1
                               check (last_level between 1 and 5),
  last_studied_at  timestamptz not null default now(),
  understanding    numeric(5, 2)
                               check (understanding between 0 and 100),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  primary key (user_id, concept_slug)
);

-- 내 지식 목록은 "최근 읽은 순"으로 뽑는다.
create index if not exists user_concepts_recent_idx
  on public.user_concepts (user_id, last_studied_at desc);

-- ────────────────────────────────────────────────
-- 2. '여기서 막혔어요' 기록
-- ────────────────────────────────────────────────
-- 어느 개념 어느 단계의 설명이 부실한지 알려주는 신호. 집필 우선순위가 된다.
-- 같은 지점을 여러 번 누를 수 있으므로 이벤트 로그 형태로 쌓는다.

create table if not exists public.stuck_events (
  id            bigint generated always as identity primary key,
  user_id       uuid        not null references auth.users (id) on delete cascade,
  concept_slug  text        not null,
  level         smallint    not null check (level between 1 and 5),
  created_at    timestamptz not null default now()
);

create index if not exists stuck_events_concept_idx
  on public.stuck_events (concept_slug, level);

-- ────────────────────────────────────────────────
-- 3. updated_at 자동 갱신
-- ────────────────────────────────────────────────

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_concepts_touch on public.user_concepts;
create trigger user_concepts_touch
  before update on public.user_concepts
  for each row execute function public.touch_updated_at();

-- ────────────────────────────────────────────────
-- 4. 행 수준 보안 (Row Level Security)
-- ────────────────────────────────────────────────
-- 이 사이트는 브라우저에서 직접 DB에 접근한다(anon key 사용).
-- 따라서 "남의 기록은 아예 보이지 않는다"를 애플리케이션 코드가 아니라
-- DB가 강제해야 한다. 아래 정책이 그 역할을 한다.
-- RLS를 켜지 않으면 anon key로 전체 테이블이 열린다. 반드시 켠 채로 둘 것.

alter table public.user_concepts enable row level security;
alter table public.stuck_events  enable row level security;

-- user_concepts: 본인 행에만 접근
drop policy if exists "본인 학습기록 조회" on public.user_concepts;
create policy "본인 학습기록 조회" on public.user_concepts
  for select using (auth.uid() = user_id);

drop policy if exists "본인 학습기록 추가" on public.user_concepts;
create policy "본인 학습기록 추가" on public.user_concepts
  for insert with check (auth.uid() = user_id);

drop policy if exists "본인 학습기록 수정" on public.user_concepts;
create policy "본인 학습기록 수정" on public.user_concepts
  for update using (auth.uid() = user_id)
             with check (auth.uid() = user_id);

drop policy if exists "본인 학습기록 삭제" on public.user_concepts;
create policy "본인 학습기록 삭제" on public.user_concepts
  for delete using (auth.uid() = user_id);

-- stuck_events: 본인 것만 남기고 볼 수 있다. 수정은 불가(이벤트 로그이므로).
drop policy if exists "본인 막힘기록 조회" on public.stuck_events;
create policy "본인 막힘기록 조회" on public.stuck_events
  for select using (auth.uid() = user_id);

drop policy if exists "본인 막힘기록 추가" on public.stuck_events;
create policy "본인 막힘기록 추가" on public.stuck_events
  for insert with check (auth.uid() = user_id);

drop policy if exists "본인 막힘기록 삭제" on public.stuck_events;
create policy "본인 막힘기록 삭제" on public.stuck_events
  for delete using (auth.uid() = user_id);
