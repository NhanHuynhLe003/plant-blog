
import { ImFacebook, ImTwitter, ImYoutube } from "react-icons/im";
import Link from "next/link";
export default function Header() {
  return (
    <header className="bg-gray-50">
      <div className="xl:container xl:mx-auto flex flex-col items-center sm:flex-row sm:justify-between text-center py-3">
        {/* sm:flex-row sm:justify-between => khi kich thuoc > 640px thi dc ap dung kich thuoc nay con be hon se la col */}
        <div className="md:flex-none w-96 order-2 sm:order-1 flex justify-center py-4 sm:py-0">
          <input className="text-input" type="text" placeholder="search" />
          {/* placeholder-slate-500: chinh mau sac chu ben trong, rounded-full: border-radius:9999 
            tuy nhien ta se chuyen toan bo thong so tren vao class ten la text-input trong globals.css
          */}
        </div>
        <div className="shrink w-80 order-1 sm:order-2">
          {/* shrink w-80 order-1 sm:order-2 => lon hon 640px thi o vitri so 2 con ko o vi tri dau */}
          <a className="uppercase font-bold text-3xl" href="/">Design </a>
          {/* text-3xl: cho do lon font-size: 3xl */}
        </div>
        <div className="w-96 order-3 flex justify-center">
          <ul className="flex gap-6 list-none">
            <li>
              <Link href="/"><ImFacebook color="#888888"/></Link>
            </li>
            <li>
              <Link href="/"><ImTwitter color="#888888"/></Link>
            </li>
            <li>
              <Link href="/"><ImYoutube color="#888888"/></Link>
            </li>
          </ul>
        </div>
      </div>
    </header>
  );
}
