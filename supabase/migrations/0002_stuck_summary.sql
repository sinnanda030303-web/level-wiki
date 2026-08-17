-- Level Wiki · 막힘 로그 집계 리포트
--
-- stuck_events는 RLS로 본인 것만 조회할 수 있다(0001_init.sql). 그런데 이
-- 로그의 진짜 쓸모는 "어느 개념 어느 단계가 부실한지"를 전체 사용자
-- 기준으로 보는 것이다. 그래서 SECURITY DEFINER 함수로 RLS를 우회하되,
-- 접근 자체를 사이트 운영자 계정 하나로 제한한다.
--
-- 반환값에는 user_id 등 개인 식별 정보가 전혀 없다. 슬러그·레벨·횟수·
-- 최근 시각만 돌려준다.

create or replace function public.stuck_summary()
returns table (
  concept_slug text,
  level        smallint,
  stuck_count  bigint,
  last_stuck_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 운영자 계정이 아니면 조용히 빈 결과를 준다. 본인이 운영자인지 아닌지를
  -- 오류 메시지로 알려주면 그 자체가 정보 노출이 되므로, 항상 같은 모양으로
  -- 응답한다.
  if coalesce(auth.jwt() ->> 'email', '') <> 'sinnanda030303@gmail.com' then
    return;
  end if;

  return query
    select
      se.concept_slug,
      se.level,
      count(*)::bigint as stuck_count,
      max(se.created_at) as last_stuck_at
    from public.stuck_events se
    group by se.concept_slug, se.level
    order by stuck_count desc, last_stuck_at desc;
end;
$$;

-- PostgREST가 RPC로 노출하려면 실행 권한이 필요하다. anon에는 주지 않는다.
-- 로그인하지 않은 사람은 애초에 auth.jwt()의 email이 없어 빈 결과를
-- 받겠지만, 권한 자체를 막아 두는 편이 명확하다.
revoke all on function public.stuck_summary() from public;
grant execute on function public.stuck_summary() to authenticated;
