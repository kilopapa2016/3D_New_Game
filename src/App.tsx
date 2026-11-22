import { useEffect, useRef, useState } from 'react';
import { Download, Play, RotateCcw, Volume2, VolumeX, ArrowUp } from 'lucide-react';
import { NeonRunnerEngine, type HudSnapshot } from './game/NeonRunnerEngine';

const INITIAL_HUD: HudSnapshot = {
  state: 'READY',
  score: 0,
  bestScore: 0,
  coins: 0,
  speedKmh: 125,
  speedRatio: 0,
  isNewBest: false,
  muted: false,
  webglError: null,
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<NeonRunnerEngine | null>(null);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const engine = new NeonRunnerEngine(mount, (snapshot) => {
      setHud(snapshot);
    });
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleStart = () => {
    engineRef.current?.startGame();
  };

  const handleToggleMute = () => {
    engineRef.current?.toggleMute();
  };

  const handleMobileJump = () => {
    engineRef.current?.triggerJump();
  };

  const handleMobileLeft = () => {
    engineRef.current?.moveLeft();
  };

  const handleMobileRight = () => {
    engineRef.current?.moveRight();
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#050712] text-slate-100">
      {/* Isolated WebGL Viewport Container */}
      <div
        ref={canvasMountRef}
        className="absolute inset-0 w-full h-full"
        aria-label="네온 큐브 러너 3D 게임 캔버스"
      />

      {/* Graceful WebGL Fallback */}
      {hud.webglError && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#060916] p-6">
          <div className="max-w-md w-full rounded-xl border border-rose-500/40 bg-[#0b1024] p-6 text-center">
            <h2 className="font-display text-xl font-bold text-rose-400">
              WebGL 초기화 오류
            </h2>
            <p className="mt-2 text-sm text-slate-300">{hud.webglError}</p>
            <p className="mt-3 text-xs text-slate-400">
              브라우저의 하드웨어 가속을 활성화하거나 최신 크롬/엣지/사파리에서 실행해 주세요.
            </p>
          </div>
        </div>
      )}

      {/* Top HUD Overlay (Minimal, Zero Center Obstruction) */}
      <header className="pointer-events-none absolute top-0 left-0 right-0 z-20 flex items-start justify-between gap-4 px-4 py-4 sm:px-6">
        {/* Left: Score & Coins */}
        <div className="rounded-lg border border-cyan-400/25 bg-[#070b18]/85 px-4 py-2.5 min-w-[148px]">
          <div className="text-[11px] font-medium tracking-wider text-cyan-300/80">
            현재 점수
          </div>
          <div className="font-display text-2xl sm:text-3xl font-bold leading-tight text-white tabular-nums">
            {hud.score.toLocaleString()}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-amber-300/90 tabular-nums">
            <span>에너지 코인</span>
            <span aria-hidden="true">·</span>
            <span className="font-display font-semibold">{hud.coins}</span>
          </div>
        </div>

        {/* Center: Speedometer (Visible during gameplay) */}
        {hud.state === 'PLAYING' && (
          <div className="hidden sm:flex flex-col items-center rounded-lg border border-cyan-400/20 bg-[#070b18]/85 px-5 py-2.5 min-w-[180px]">
            <div className="flex items-baseline gap-1.5">
              <span className="font-display text-2xl font-bold text-cyan-300 tabular-nums">
                {hud.speedKmh}
              </span>
              <span className="font-display text-xs font-medium text-slate-400">
                KM/H
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-36 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 via-sky-400 to-pink-500 transition-transform duration-150 origin-left"
                style={{ transform: `scaleX(${Math.max(0.08, hud.speedRatio)})` }}
              />
            </div>
          </div>
        )}

        {/* Right: Best Score & Mute Control */}
        <div className="pointer-events-auto flex items-stretch gap-2">
          <div className="rounded-lg border border-pink-500/25 bg-[#070b18]/85 px-4 py-2.5 text-right min-w-[120px]">
            <div className="text-[11px] font-medium tracking-wider text-pink-300/80">
              최고 점수
            </div>
            <div className="font-display text-xl sm:text-2xl font-bold leading-tight text-white tabular-nums">
              {hud.bestScore.toLocaleString()}
            </div>
            {hud.state === 'PLAYING' && (
              <div className="sm:hidden mt-0.5 text-[11px] font-display text-cyan-300 tabular-nums">
                {hud.speedKmh} KM/H
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleToggleMute}
            aria-label={hud.muted ? '효과음 켜기' : '효과음 끄기'}
            title={hud.muted ? '효과음 켜기 (M)' : '효과음 끄기 (M)'}
            className="flex h-auto min-w-[44px] items-center justify-center rounded-lg border border-slate-700/80 bg-[#070b18]/85 px-3 text-slate-200 transition-colors hover:border-cyan-400/60 hover:text-cyan-300 focus-visible:outline-2 focus-visible:outline-cyan-400 cursor-pointer"
          >
            {hud.muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {/* Start Screen Overlay (READY State) */}
      {hud.state === 'READY' && !hud.webglError && (
        <main className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-4">
          <section className="pointer-events-auto w-full max-w-md rounded-xl border border-cyan-400/35 bg-[#070b18]/90 p-7 sm:p-8 text-center shadow-2xl">
            <p className="font-display text-xs font-semibold tracking-[0.22em] text-cyan-300">
              3D ARCADE ENDLESS RUNNER
            </p>
            <h1 className="mt-2 font-display text-3xl sm:text-4xl font-bold tracking-tight text-white [text-wrap:balance]">
              네온 큐브 러너
            </h1>
            <p className="mt-2.5 text-sm leading-relaxed text-slate-300">
              네온 그리드 트랙을 고속 질주하며 다가오는 장애물을 피하고 에너지 코인을 수집하세요.
            </p>

            {/* Concise Key & Touch Legend */}
            <div className="mt-6 grid grid-cols-2 gap-3 border-y border-slate-800 py-4 text-left text-xs text-slate-300">
              <div>
                <div className="font-semibold text-cyan-300">레인 이동</div>
                <div className="mt-1 text-slate-400">← / → 또는 A / D · 좌/우 탭</div>
              </div>
              <div>
                <div className="font-semibold text-pink-400">점프</div>
                <div className="mt-1 text-slate-400">Space / W / ↑ · 위로 스와이프</div>
              </div>
            </div>

            {hud.bestScore > 0 && (
              <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400 tabular-nums">
                <span>저장된 최고 기록</span>
                <span aria-hidden="true">·</span>
                <span className="font-display font-bold text-amber-300">
                  {hud.bestScore.toLocaleString()} 점
                </span>
              </div>
            )}

            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={handleStart}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-400 px-6 py-3.5 font-display text-base font-bold text-slate-950 transition-transform duration-150 hover:bg-cyan-300 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 cursor-pointer whitespace-nowrap"
              >
                <Play className="h-5 w-5 fill-current" />
                <span>게임 시작</span>
              </button>

              <a
                href="/neon-cube-runner.html"
                download="neon-cube-runner.html"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700/90 bg-slate-900/80 px-4 py-2.5 text-xs font-medium text-slate-300 transition-colors hover:border-cyan-400/50 hover:text-cyan-200 whitespace-nowrap"
              >
                <Download className="h-4 w-4" />
                <span>단일 HTML 파일 다운로드 (로컬 즉시 실행)</span>
              </a>
            </div>
          </section>
        </main>
      )}

      {/* Game Over Overlay (GAMEOVER State) */}
      {hud.state === 'GAMEOVER' && !hud.webglError && (
        <main className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-4">
          <section className="pointer-events-auto w-full max-w-md rounded-xl border border-pink-500/40 bg-[#080a18]/92 p-7 sm:p-8 text-center shadow-2xl">
            <p className="font-display text-xs font-semibold tracking-[0.22em] text-pink-400">
              RUN TERMINATED
            </p>
            <h2 className="mt-1.5 font-display text-3xl sm:text-4xl font-bold tracking-tight text-white">
              GAME OVER
            </h2>

            {hud.isNewBest && (
              <p className="mt-2 font-display text-sm font-semibold text-amber-300">
                신기록 달성! 최고 점수를 경신했습니다
              </p>
            )}

            {/* Run Summary Grid */}
            <div className="mt-6 grid grid-cols-3 gap-2 border-y border-slate-800 py-4">
              <div>
                <div className="text-[11px] text-slate-400">최종 점수</div>
                <div className="mt-1 font-display text-xl font-bold text-white tabular-nums">
                  {hud.score.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">에너지 코인</div>
                <div className="mt-1 font-display text-xl font-bold text-amber-300 tabular-nums">
                  {hud.coins}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">도달 속도</div>
                <div className="mt-1 font-display text-xl font-bold text-cyan-300 tabular-nums">
                  {hud.speedKmh}
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-400 tabular-nums">
              <span>최고 기록</span>
              <span aria-hidden="true">·</span>
              <span className="font-display font-semibold text-pink-300">
                {hud.bestScore.toLocaleString()} 점
              </span>
            </div>

            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={handleStart}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-pink-500 px-6 py-3.5 font-display text-base font-bold text-white transition-transform duration-150 hover:bg-pink-400 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-400 cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="h-5 w-5" />
                <span>다시 시작</span>
              </button>

              <a
                href="/neon-cube-runner.html"
                download="neon-cube-runner.html"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700/90 bg-slate-900/80 px-4 py-2.5 text-xs font-medium text-slate-300 transition-colors hover:border-cyan-400/50 hover:text-cyan-200 whitespace-nowrap"
              >
                <Download className="h-4 w-4" />
                <span>단일 HTML 파일 다운로드</span>
              </a>
            </div>
          </section>
        </main>
      )}

      {/* Subtle Bottom Controls Bar (Playing State - Mobile Touch & Desktop Hint) */}
      {hud.state === 'PLAYING' && (
        <footer className="pointer-events-none absolute bottom-4 left-0 right-0 z-20 flex items-center justify-center px-4">
          {/* Desktop subtle helper */}
          <div className="hidden md:flex items-center gap-3 rounded-lg border border-slate-800/90 bg-[#070b18]/75 px-4 py-1.5 text-xs text-slate-400">
            <span>← / → 또는 A / D 이동</span>
            <span aria-hidden="true">·</span>
            <span>Space 점프</span>
            <span aria-hidden="true">·</span>
            <span>M 음소거</span>
          </div>

          {/* Mobile/Tablet Touch Buttons */}
          <div className="pointer-events-auto flex md:hidden w-full max-w-sm items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleMobileLeft}
              aria-label="왼쪽 레인 이동"
              className="flex h-12 flex-1 items-center justify-center rounded-lg border border-cyan-400/30 bg-[#070b18]/80 font-display text-sm font-semibold text-cyan-200 active:bg-cyan-400/20"
            >
              ◀ 좌
            </button>
            <button
              type="button"
              onClick={handleMobileJump}
              aria-label="점프"
              className="flex h-12 flex-1 items-center justify-center gap-1 rounded-lg border border-pink-400/40 bg-[#070b18]/85 font-display text-sm font-bold text-pink-300 active:bg-pink-500/25"
            >
              <ArrowUp className="h-4 w-4" />
              <span>점프</span>
            </button>
            <button
              type="button"
              onClick={handleMobileRight}
              aria-label="오른쪽 레인 이동"
              className="flex h-12 flex-1 items-center justify-center rounded-lg border border-cyan-400/30 bg-[#070b18]/80 font-display text-sm font-semibold text-cyan-200 active:bg-cyan-400/20"
            >
              우 ▶
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}
