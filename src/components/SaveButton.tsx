import { useCallback, useEffect, useState } from 'react';
import { isSaved, saveConcept, subscribe, unsaveConcept } from '../lib/store';
import type { Level } from '../lib/types';

interface Props {
  slug: string;
  /** 지금 보고 있는 난이도. 저장할 때 진도로 함께 기록한다. */
  level: Level;
}

export default function SaveButton({ slug, level }: Props) {
  const [saved, setSaved] = useState(false);
  // 저장한 직후에만 안내를 띄운다. 이미 저장된 문서를 다시 열 때는 조용히 둔다.
  const [justSaved, setJustSaved] = useState(false);

  // 서버에서는 저장 여부를 알 수 없으므로 항상 '저장 안 됨'으로 그리고,
  // 마운트 후에 실제 값으로 맞춘다.
  useEffect(() => {
    const sync = () => setSaved(isSaved(slug));
    sync();
    return subscribe(sync);
  }, [slug]);

  const toggle = useCallback(() => {
    if (isSaved(slug)) {
      unsaveConcept(slug);
      setJustSaved(false);
    } else {
      saveConcept(slug, level);
      setJustSaved(true);
    }
  }, [slug, level]);

  return (
    <div className="save-wrap">
      <button
        type="button"
        className="btn-save"
        data-saved={saved}
        aria-pressed={saved}
        onClick={toggle}
      >
        <span className="save-mark" aria-hidden="true">{saved ? '✓' : '＋'}</span>
        {saved ? '내 지식에 있음' : '내 지식에 추가'}
      </button>

      {saved && justSaved && (
        <p className="save-note" role="status">
          지금 보고 있는 <b>{level}단계</b>까지 함께 기록했습니다.{' '}
          <a href="/my">내 지식 보기 →</a>
        </p>
      )}
    </div>
  );
}
