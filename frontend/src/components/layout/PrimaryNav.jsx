// frontend/src/components/layout/PrimaryNav.jsx

import { PRIMARY_SECTIONS } from "../../navigation.js";

function PrimaryNav({
  activeSection,
  onSelect,
  idPrefix = "page",
}) {
  return (
    <nav
      className="primary-nav"
      aria-label="House pages"
    >
      {PRIMARY_SECTIONS.map((section) => {
        const isActive =
          activeSection === section.id;

        return (
          <button
            key={section.id}
            type="button"
            id={`${idPrefix}-${section.id}`}
            className={
              isActive
                ? "primary-nav-button active"
                : "primary-nav-button"
            }
            aria-current={
              isActive ? "page" : undefined
            }
            onClick={() => onSelect(section.id)}
          >
            {section.label}
          </button>
        );
      })}
    </nav>
  );
}

export default PrimaryNav;
