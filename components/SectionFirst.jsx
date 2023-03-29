import React from "react";
import Image from "next/image";
import Link from "next/link";
import Author from "./childrenComponents/Author";

// import Swiper styles
import "swiper/css";
import { Swiper, SwiperSlide } from "swiper/react";
import SwiperCore, { Autoplay } from "swiper";

export default function SectionFirst() {
  SwiperCore.use([Autoplay]);
  const imgSrcList = [
    { id: 1, src: "/images/img1.jpg", alt: "img1" },
    { id: 2, src: "/images/img2.jpg", alt: "img2" },
    { id: 3, src: "/images/img3.jpg", alt: "img3" },
    { id: 4, src: "/images/img4.jpg", alt: "img4" },
    { id: 5, src: "/images/img5.jpg", alt: "img5" },
  ];
  const bgStyle = {
    background: "url('/images/banner.png') no-repeat",
    backgroundPosition: "right",
  };
  return (
    <section id="firstSection" className="py-16" style={bgStyle}>
      <div className="container mx-auto md: px-20">
        <h1 className="font-bold text-center text-4xl pb-20 capitalize">
          trending
        </h1>
        <Swiper
          slidesPerView={1}
          autoplay={{
            delay: 3000,
          }}
          loop={true}
        >
          {imgSrcList.map((impProp, index) => {
            return <SwiperSlide key={impProp.id}>{Slider(impProp)}</SwiperSlide>
          })}
          
        </Swiper>
      </div>
    </section>
  );
}

function Slider(imgProp) {
  return (
    <div className="grid md:grid-cols-2">
      <div className="images">
        <Link href="/">
          <Image src={imgProp.src} alt={imgProp.alt} width={500} height={600} />
        </Link>
      </div>
      <div className="info flex justify-center flex-col">
        <div className="category flex gap-2">
          <Link
            href="/"
            className="genres capitalize text-orange-600 hover:text-orange-700"
          >
            business, travel
          </Link>
          <span>-</span>
          <Link
            href="/"
            className="genres capitalize text-gray-800 hover:text-gray-600"
          >
            march 29, 2023
          </Link>
        </div>
        <div className="title pt-4">
          <Link href="/">
            <h1 className="text-3xl md:text-6xl font-bold text-gray-800 hover:text-gray-600">
              First Blog
            </h1>
          </Link>
          <p className="description text-gray-500 py-4">
            Lorem, ipsum dolor sit amet consectetur adipisicing elit. Error,
            quidem. Unde corporis deleniti maxime, illo facere accusantium modi
            eaque debitis autem amet facilis non laboriosam, obcaecati eligendi
            deserunt fugiat vitae.
          </p>
          <Author />
        </div>
      </div>
    </div>
  );
}
