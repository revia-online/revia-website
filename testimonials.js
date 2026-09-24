(() => {
  "use strict";

  const testimonialData = [
    {
      id: "parent-hiroshima-junior-high-3",
      type: "parent",
      gender: "female",
      schoolStage: null,
      relationship: "mother",
      prefecture: "広島県",
      attribute: "中学3年生の保護者",
      title: "受験直前の不安の中、予定通り指導していただけたことが本当にありがたかったです",
      body: [
        "受験直前に決断し、約1か月間の短期で申し込んだ会社が倒産となり、目の前が真っ暗になりました。",
        "そんな中、原田先生から無償で予定通り授業をすると言っていただいたことは、本当にありがたかったです。",
        "本人はもともと勉強をしたくなかったこともあり、最初は「もういい」と言っていました。それでも授業の時間になるとZoomにつないでいたので、親としても安心しました。",
        "勉強のクセがついたかと言えば、受験後は全く勉強しておりません。ただ今回、家族でも先生でも友達でもない方からご指導いただいたことは、息子にとって良い経験になったと思います。",
        "原田先生に教えていただいたことで、これまで「分からないことを分からないままやり過ごしてきた」ということを、本人も認識できたのではないかと感じています。",
        "これからも勉強はついて回ります。今回の経験を、これからに生かしていってくれたらと思います。",
        "ありがとうございました。",
      ],
      year: "pre-opening",
    },
    {
      id: "student-aichi-high-school-3",
      type: "student",
      gender: "female",
      schoolStage: "high-school",
      relationship: null,
      prefecture: "愛知県",
      attribute: "指導当時：高校3年生・女子",
      title: "授業だけでなく、面接対策まで一緒に考えてもらえました",
      body: [
        "以前から塾には通っていましたが、思うように成績が伸びず、家の近くに予備校もなかったため、オンラインで授業を受けることにしました。",
        "最初は原田先生を少し怖そうだと思っていましたが（笑）、授業ではとても一生懸命に教えてくださり、実際はとても優しい先生でした。",
        "教材の問題解説だけではなく、その場で質問をされたり、先生が考えた問題に取り組んだりしたことで、かなり実力がついたと感じています。面接対策でも、私が受ける学部に合わせて質問を考えてくださり、とても助かりました。",
        "先生のおかげで第一志望に合格でき、今は充実した大学生活を送っています。",
        "大学の実験や授業は大変ですが、先生が話してくれた「なぜ勉強するのか」ということを思い出しながら、将来の目標に向かって頑張っていきたいです。",
      ],
      year: "pre-opening",
    },
  ];

  const testimonialTypeLabels = {
    student: "生徒",
    parent: "保護者",
    adult: "成人",
  };

  const availableIconKeys = new Set([
    "elementary-male",
    "elementary-female",
    "junior-high-male",
    "junior-high-female",
    "high-school-male",
    "high-school-female",
    "university-male",
    "university-female",
    "adult-male",
    "adult-female",
    "parent-male",
    "parent-female",
    "unknown",
  ]);

  const getTestimonialTypeLabel = (type) => testimonialTypeLabels[type] || "体験談";

  const getPersonIconKey = ({ type, gender, schoolStage, relationship }) => {
    if (type === "parent") {
      if (relationship === "father") {
        return "parent-male";
      }

      if (relationship === "mother") {
        return "parent-female";
      }

      const parentKey = `parent-${gender}`;
      return availableIconKeys.has(parentKey) ? parentKey : "unknown";
    }

    if (type === "student") {
      const studentKey = `${schoolStage}-${gender}`;
      return availableIconKeys.has(studentKey) ? studentKey : "unknown";
    }

    if (type === "adult") {
      const adultKey = `${schoolStage === "university" ? "university" : "adult"}-${gender}`;
      return availableIconKeys.has(adultKey) ? adultKey : "unknown";
    }

    return "unknown";
  };

  const formatPrefecture = (prefecture) => {
    const label = String(prefecture || "");
    return label.endsWith("在住") ? label : `${label}在住`;
  };

  const createPersonIcon = (testimonial) => {
    const icon = document.createElement("span");
    const iconKey = getPersonIconKey(testimonial);
    icon.className = `testimonial-person-icon testimonial-person-icon-${testimonial.type}`;
    icon.dataset.iconKey = iconKey;
    icon.setAttribute("aria-hidden", "true");

    const svgNamespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNamespace, "svg");
    svg.setAttribute("viewBox", "0 0 96 96");
    svg.setAttribute("focusable", "false");

    const use = document.createElementNS(svgNamespace, "use");
    use.setAttribute("href", `assets/testimonials/person-icons.svg#${iconKey}`);
    svg.append(use);
    icon.append(svg);
    return icon;
  };

  const createBadge = (text, className) => {
    const badge = document.createElement("span");
    badge.className = `testimonial-badge ${className}`;
    badge.textContent = text;
    return badge;
  };

  const createTestimonialCard = (testimonial, index, total) => {
    const typeLabel = getTestimonialTypeLabel(testimonial.type);
    const card = document.createElement("article");
    card.className = "testimonial-card";
    card.dataset.testimonialId = testimonial.id;
    card.dataset.testimonialYear = testimonial.year;
    card.setAttribute("role", "group");
    card.setAttribute("aria-roledescription", "スライド");
    card.setAttribute("aria-label", `${index + 1} / ${total}：${typeLabel}の体験談`);
    card.hidden = index !== 0;

    const profile = document.createElement("div");
    profile.className = "testimonial-profile";
    profile.append(createPersonIcon(testimonial));

    const profileDetails = document.createElement("div");
    profileDetails.className = "testimonial-profile-details";
    profileDetails.append(
      createBadge(typeLabel, "testimonial-type-badge"),
      createBadge(formatPrefecture(testimonial.prefecture), "testimonial-location-badge")
    );

    const attribute = document.createElement("p");
    attribute.className = "testimonial-attribute";
    attribute.textContent = testimonial.attribute;
    profileDetails.append(attribute);
    profile.append(profileDetails);

    const content = document.createElement("div");
    content.className = "testimonial-content";

    const quote = document.createElement("span");
    quote.className = "testimonial-quote";
    quote.setAttribute("aria-hidden", "true");
    quote.textContent = "“";

    const heading = document.createElement("h3");
    heading.textContent = testimonial.title;
    content.append(quote, heading);

    const body = document.createElement("div");
    body.className = "testimonial-body";
    testimonial.body.forEach((paragraphText) => {
      const paragraph = document.createElement("p");
      paragraph.textContent = paragraphText;
      body.append(paragraph);
    });
    content.append(body);

    card.append(profile, content);
    return card;
  };

  try {
    const carousel = document.querySelector("[data-testimonials-carousel]");
    const stage = carousel?.querySelector("[data-testimonials-stage]");
    const controls = carousel?.querySelector("[data-testimonials-controls]");
    const previousButton = carousel?.querySelector("[data-testimonial-prev]");
    const nextButton = carousel?.querySelector("[data-testimonial-next]");
    const dotsContainer = carousel?.querySelector("[data-testimonial-dots]");
    const status = carousel?.querySelector("[data-testimonial-status]");

    if (!carousel || !stage || !controls || !previousButton || !nextButton || !dotsContainer || !status || !testimonialData.length) {
      return;
    }

    const slides = testimonialData.map((testimonial, index) =>
      createTestimonialCard(testimonial, index, testimonialData.length)
    );
    const slideFragment = document.createDocumentFragment();
    slides.forEach((slide) => slideFragment.append(slide));

    const dotButtons = testimonialData.map((testimonial, index) => {
      const typeLabel = getTestimonialTypeLabel(testimonial.type);
      const button = document.createElement("button");
      button.className = "testimonial-dot";
      button.type = "button";
      button.setAttribute("aria-label", `${index + 1}件目、${typeLabel}の体験談を表示`);
      button.setAttribute("aria-current", index === 0 ? "true" : "false");
      return button;
    });
    const dotsFragment = document.createDocumentFragment();
    dotButtons.forEach((button) => dotsFragment.append(button));

    let currentIndex = 0;
    let touchStartX = 0;
    let touchStartY = 0;

    const showTestimonial = (requestedIndex, announce = true) => {
      currentIndex = (requestedIndex + slides.length) % slides.length;
      slides.forEach((slide, index) => {
        const isCurrent = index === currentIndex;
        slide.hidden = !isCurrent;
        slide.setAttribute("aria-hidden", String(!isCurrent));
      });
      dotButtons.forEach((button, index) => {
        button.setAttribute("aria-current", index === currentIndex ? "true" : "false");
      });

      if (announce) {
        status.textContent = `${currentIndex + 1} / ${slides.length}　${getTestimonialTypeLabel(testimonialData[currentIndex].type)}の体験談`;
      }
    };

    previousButton.addEventListener("click", () => showTestimonial(currentIndex - 1));
    nextButton.addEventListener("click", () => showTestimonial(currentIndex + 1));
    dotButtons.forEach((button, index) => {
      button.addEventListener("click", () => showTestimonial(index));
    });

    carousel.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        showTestimonial(currentIndex - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        showTestimonial(currentIndex + 1);
      } else if (event.key === "Home") {
        event.preventDefault();
        showTestimonial(0);
      } else if (event.key === "End") {
        event.preventDefault();
        showTestimonial(slides.length - 1);
      }
    });

    stage.addEventListener(
      "touchstart",
      (event) => {
        const touch = event.touches[0];
        touchStartX = touch?.clientX || 0;
        touchStartY = touch?.clientY || 0;
      },
      { passive: true }
    );

    stage.addEventListener(
      "touchend",
      (event) => {
        const touch = event.changedTouches[0];
        if (!touch) {
          return;
        }

        const distanceX = touch.clientX - touchStartX;
        const distanceY = touch.clientY - touchStartY;
        if (Math.abs(distanceX) < 50 || Math.abs(distanceX) <= Math.abs(distanceY) * 1.2) {
          return;
        }

        showTestimonial(currentIndex + (distanceX < 0 ? 1 : -1));
      },
      { passive: true }
    );

    showTestimonial(0, false);
    stage.replaceChildren(slideFragment);
    dotsContainer.replaceChildren(dotsFragment);
    controls.hidden = slides.length < 2;
    carousel.tabIndex = 0;
    carousel.classList.add("is-ready");
  } catch (error) {
    console.error("体験談カルーセルを初期化できませんでした。", error);
  }
})();
