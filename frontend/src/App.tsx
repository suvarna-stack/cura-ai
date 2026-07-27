import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Training from "./pages/Training";
import Placeholder from "./pages/Placeholder";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Placeholder title="Dashboard" />} />
        <Route path="/accounts" element={<Placeholder title="Accounts" />} />
        <Route path="/training" element={<Training />} />
        <Route path="*" element={<Navigate to="/training" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
