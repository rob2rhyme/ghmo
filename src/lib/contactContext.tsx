"use client";

import { createContext, useContext, type ReactNode } from "react";

const ContactEmailContext = createContext<string | null>(null);

/** Makes GHMO's contact address (getContactEmail() on the server) available to client components such as error pages. */
export function ContactEmailProvider({
  value,
  children,
}: {
  value: string | null;
  children: ReactNode;
}) {
  return (
    <ContactEmailContext.Provider value={value}>
      {children}
    </ContactEmailContext.Provider>
  );
}

export function useContactEmail(): string | null {
  return useContext(ContactEmailContext);
}
