import { Nav } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { vi } from '../i18n/translations';

const CheckoutSteps = ({ step1, step2, step3, step4 }) => {
  return (
    <Nav className='justify-content-center mb-4'>
      <Nav.Item>
        {step1 ? (
          <Nav.Link as={Link} to='/login'>
            {vi.login}
          </Nav.Link>
        ) : (
          <Nav.Link disabled>{vi.login}</Nav.Link>
        )}
      </Nav.Item>

      <Nav.Item>
        {step2 ? (
          <Nav.Link as={Link} to='/shipping'>
            {vi.shipping}
          </Nav.Link>
        ) : (
          <Nav.Link disabled>{vi.shipping}</Nav.Link>
        )}
      </Nav.Item>

      <Nav.Item>
        {step3 ? (
          <Nav.Link as={Link} to='/payment'>
            {vi.payment}
          </Nav.Link>
        ) : (
          <Nav.Link disabled>{vi.payment}</Nav.Link>
        )}
      </Nav.Item>

      <Nav.Item>
        {step4 ? (
          <Nav.Link as={Link} to='/placeorder'>
            {vi.placeOrder}
          </Nav.Link>
        ) : (
          <Nav.Link disabled>{vi.placeOrder}</Nav.Link>
        )}
      </Nav.Item>
    </Nav>
  );
};

export default CheckoutSteps;
