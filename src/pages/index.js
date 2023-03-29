
import { Inter } from 'next/font/google'
import MainLayout from '../../layouts/MainLayout'
import SectionFirst from '../../components/SectionFirst'

const inter = Inter({ subsets: ['latin'] })

export default function Home() {
  return (
    <div className='Home'>
      <MainLayout>
        <SectionFirst/>
      </MainLayout>
    </div>
  )
}
