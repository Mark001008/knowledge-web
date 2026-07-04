/**
 * 无权限页面
 */
export function NoPermissionPage() {
  return (
    <div className="no-permission-page">
      <div className="no-permission-content">
        <h1>403</h1>
        <h2>无权访问</h2>
        <p>抱歉，您没有权限访问此页面。</p>
        <p>请联系管理员获取相应权限。</p>
      </div>
    </div>
  );
}
