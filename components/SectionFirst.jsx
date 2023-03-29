import React from 'react'
import Image from 'next/image'
import Link from 'next/link'
export default function SectionFirst() {
  return (
    <section id="firstSection" className='py-16'>
        <div className="container mx-auto md: px-20">
            <h1 className="font-bold text-center text-4xl pb-20 capitalize">trending</h1>
            {Slider()}
        </div>
    </section>
  )
}

function Slider(){
    return (
        <div className='grid md:grid-cols-2'>
            <div className="images">
                <Link href="/"><Image src="/images/img1.jpg" width={600} height={600}/></Link>  
            </div>
            <div className="info flex justify-center flex-col">
                <div className="category flex gap-2">
                    <Link href="/" className='genres capitalize text-orange-600 hover:text-orange-700'>business, travel</Link>
                    <span>-</span>
                    <Link href="/" className='genres capitalize text-gray-800 hover:text-gray-600'>march 29, 2023</Link>
                </div>
                <div className="title pt-4" >
                    <Link href="/">
                        <h1 className='text-3xl md:text-6xl font-bold text-gray-800 hover:text-gray-600'>First Blog</h1>
                    </Link>
                    <p className='description text-gray-500 py-4'>
                        Lorem, ipsum dolor sit amet consectetur adipisicing elit. Error, quidem. Unde corporis deleniti maxime, illo facere accusantium modi eaque debitis autem amet facilis non laboriosam, obcaecati eligendi deserunt fugiat vitae.
                    </p>
                    <h3 className='author'>author</h3>
                </div>
            </div>
        </div>
    )
}