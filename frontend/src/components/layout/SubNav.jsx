// frontend/src/components/layout/SubNav.jsx

function SubNav({
  label,
  items,
  activeId,
  onSelect,
  idPrefix,
  panelId,
}) {
  return (
    <nav
      className="tab-list"
      role="tablist"
      aria-label={label}
    >
      {items.map((item) => {
        const isActive = activeId === item.id;

        return (
          <button
            key={item.id}
            type="button"
            id={`${idPrefix}-${item.id}`}
            role="tab"
            aria-selected={isActive}
            aria-controls={panelId}
            className={
              isActive
                ? "tab-button active"
                : "tab-button"
            }
            onClick={() => onSelect(item.id)}
          >
            {item.label}
            {item.count != null ? (
              <span>{item.count}</span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

export default SubNav;
