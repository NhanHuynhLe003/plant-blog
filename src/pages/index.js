
import { Inter } from 'next/font/google'
import MainLayout from '../../layouts/MainLayout'
import SectionFirst from '../../components/SectionFirst'
import SectionSecond from '../../components/SectionSecond'
import SectionThird from '../../components/SectionThird'

const inter = Inter({ subsets: ['latin'] })

export default function Home() {
  return (
    <div className='Home'>
      <MainLayout>
        <SectionFirst/>
        <SectionSecond/>
        <SectionThird/>
      </MainLayout>
    </div>
  )
}
