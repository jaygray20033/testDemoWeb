import { Pagination } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { vi } from '../i18n/translations';

const Paginate = ({ pages, page, isAdmin = false, keyword = '' }) => {
  const startPage = Math.max(1, page - 2);
  const endPage = Math.min(pages, page + 2);

  return (
    pages > 1 && (
      <Pagination className='justify-content-center my-4'>
        {/* Previous button */}
        {page > 1 && (
          <Pagination.Item
            as={Link}
            to={
              !isAdmin
                ? keyword
                  ? `/search/${keyword}/page/${page - 1}`
                  : `/page/${page - 1}`
                : `/admin/productlist/${page - 1}`
            }
          >
            {vi.previous}
          </Pagination.Item>
        )}

        {/* First page button if not visible */}
        {startPage > 1 && (
          <>
            <Pagination.Item
              as={Link}
              to={
                !isAdmin
                  ? keyword
                    ? `/search/${keyword}/page/1`
                    : `/page/1`
                  : `/admin/productlist/1`
              }
            >
              1
            </Pagination.Item>
            {startPage > 2 && <Pagination.Ellipsis disabled />}
          </>
        )}

        {/* Page numbers */}
        {[...Array(endPage - startPage + 1).keys()].map((x) => (
          <Pagination.Item
            as={Link}
            key={startPage + x}
            to={
              !isAdmin
                ? keyword
                  ? `/search/${keyword}/page/${startPage + x}`
                  : `/page/${startPage + x}`
                : `/admin/productlist/${startPage + x}`
            }
            active={startPage + x === page}
          >
            {startPage + x}
          </Pagination.Item>
        ))}

        {/* Last page button if not visible */}
        {endPage < pages && (
          <>
            {endPage < pages - 1 && <Pagination.Ellipsis disabled />}
            <Pagination.Item
              as={Link}
              to={
                !isAdmin
                  ? keyword
                    ? `/search/${keyword}/page/${pages}`
                    : `/page/${pages}`
                  : `/admin/productlist/${pages}`
              }
            >
              {pages}
            </Pagination.Item>
          </>
        )}

        {/* Next button */}
        {page < pages && (
          <Pagination.Item
            as={Link}
            to={
              !isAdmin
                ? keyword
                  ? `/search/${keyword}/page/${page + 1}`
                  : `/page/${page + 1}`
                : `/admin/productlist/${page + 1}`
            }
          >
            {vi.next}
          </Pagination.Item>
        )}
      </Pagination>
    )
  );
};

export default Paginate;
