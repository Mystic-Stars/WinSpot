import { render } from "solid-js/web";
import { ErrorBoundary } from "solid-js";
import App from "./App";
import "./styles.css";

render(() => <ErrorBoundary fallback={(error, reset) => <div class="fatal">
  <h1>WinSpot 暂时无法显示</h1><p>{String(error)}</p>
  <button class="primary-button" onClick={reset}>重新加载</button>
</div>}><App /></ErrorBoundary>, document.getElementById("root")!);
