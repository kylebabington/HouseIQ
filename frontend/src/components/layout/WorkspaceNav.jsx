function WorkspaceNav({
  items,
  value,
  onChange,
  ariaLabel,
  counts = {},
  variant = "primary",
}) {
  return (
    <nav
      className={
        variant === "sub"
          ? "workspace-nav workspace-subnav"
          : "workspace-nav"
      }
      role="tablist"
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const count = counts[item.id];
        const isActive = value === item.id;

        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={
              isActive
                ? "workspace-nav-button active"
                : "workspace-nav-button"
            }
            onClick={() => onChange(item.id)}
          >
            {item.label}
            {count != null ? (
              <span>{count}</span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

export default WorkspaceNav;
