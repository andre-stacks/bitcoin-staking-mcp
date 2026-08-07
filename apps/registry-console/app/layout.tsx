import "./styles.css";

export const metadata = { title: "Scout Live Knowledge Registry", robots: { index: false, follow: false } };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
