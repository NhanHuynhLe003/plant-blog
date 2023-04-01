import Head from "next/head";
import Footer from "../components/Footer";
import Header from "../components/Header";
import style from "./mainLayout.module.scss"

export default function MainLayout({children}) {
  return (
    <>
        <Head>
            <title>Plant Blog</title>
        </Head>
        <Header/>
        <main className={style.mainContent}>{children}</main>
        <Footer/>
    </>
  )
}
