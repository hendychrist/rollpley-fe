import Image from "next/image";

export function Logo() {
  return <div className="logo"><Image className="logo__image" src="/brand/rollpley-logo.png" alt="" width={56} height={56} /><strong>ROLLPLEY</strong></div>;
}
