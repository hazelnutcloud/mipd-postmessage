import "./App.css";
import { Child } from "./components/Child";
import { Parent } from "./components/Parent";

const isChild =
  new URLSearchParams(window.location.search).get("mode") === "child";

function App() {
  return isChild ? <Child></Child> : <Parent></Parent>;
}

export default App;
