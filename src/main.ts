import './style.css';
import { GameApplication } from './app/GameApplication';

const game = new GameApplication();

// Dev-only console hook: __dfm.getDiagnostics() and __dfm.runLifecycleStress(20).
if (import.meta.env.DEV) (window as unknown as { __dfm?: GameApplication }).__dfm = game;
if (import.meta.hot) import.meta.hot.dispose(() => game.dispose());
