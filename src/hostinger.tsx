import { RouterProvider } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";

import { getRouter } from "@/router";
import "@/styles.css";

const element = document.getElementById("root");
if (!element) throw new Error("Application root was not found.");

const router = getRouter();
createRoot(element).render(<RouterProvider router={router} />);
